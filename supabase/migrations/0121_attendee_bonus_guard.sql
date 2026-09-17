-- wave 9 (REQ-SES-017, REQ-PTS-012, the lead's row L9) — the presenter's
-- attendee bonus, made safe against `main`'s OLD worker.
--
-- `0113` moved the attendee's OWN award behind the attendance predicate and a
-- standing-award check, and taught `worker/src/tasks/award_presenter_points.ts`
-- to award one bonus per QUALIFYING ATTENDEE. Both halves of that are true only
-- while the new worker is the caller. This file moves the rule into SQL, where
-- it is true whichever worker calls — which is what the deploy window needs,
-- because Railway's source has lagged the merge three times running.
--
-- Nothing else in award_points() changes: `0113`'s body, re-created with one
-- branch added.
--
-- Serves:  REQ-SES-017, REQ-PTS-011, REQ-PTS-012, REQ-PTS-013, invariant 9,
--          invariant 3 (the additive-migration rule the window comes from)
-- Cites:   0113 (award_points, attendance_epoch_check_in, the predicate —
--          re-created and called, not copied), 0087 (the reversal that pairs
--          a bonus to the attendee's check-ins), 0031 + 0081 (the cap, whose
--          accounting is untouched), 0100 (the per-day unique index that makes
--          this inert at one day)
-- Docs:    docs/plan/notes/scoring.md "Wave 9"
--
-- 03 §8.2 rows this adds:
--   | `RPC-award_points.attendee_bonus_epoch_only` | An `attendee_bonus` call naming any active check-in other than that attendee's epoch writes nothing — so `main`'s old per-check-in loop pays a three-day workshop's presenter ONE bonus per attendee, not three. |
--   | `RPC-award_points.attendee_bonus_requires_complete` | An `attendee_bonus` call for a partial attendee writes nothing, even when it names that attendee's own latest day. |
--   | `RPC-award_points.attendee_bonus_one_day_unchanged` | On a one-day session every call that writes a row today still writes it, with the same amount and the same key. |
--   | `RPC-award_points.attendee_bonus_skips_silently` | Every refusal above returns normally — `main`'s loop must never throw part-way through a session. |

create or replace function public.award_points(
  p_rule       text,
  p_member     uuid,
  p_source     public.ledger_source,
  p_source_id  uuid,
  p_session    uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r       public.scoring_rules;
  used    int;
  key     text;
  v_sess     uuid;
  v_epoch    int := 1;
  v_attendee uuid;
begin
  select * into r from public.scoring_rules
   where org_id = (select org_id from public.members where id = p_member)
     and action_key = p_rule;
  if r is null or not r.enabled then
    return;                                            -- unknown/disabled rule: award nothing
  end if;

  if p_source = 'check_in' then
    -- DEC-141's late-job race (0088), unchanged: the check-in this award is
    -- keyed to was removed before the job ran. remove_check_in() already wrote
    -- the compensating reversal for whatever WAS awarded.
    if exists (select 1 from public.check_ins where id = p_source_id and removed_at is not null) then
      return;
    end if;

    v_sess := coalesce(p_session, (select c.session_id from public.check_ins c where c.id = p_source_id));
    if v_sess is not null then
      -- REQ-SES-017: attendance points require every day, by default.
      if not public.session_attendance_complete(v_sess, p_member) then
        return;
      end if;

      -- ★ REQ-SES-017's TIMING, re-derived here and not only in
      -- attendance_recorded(). A multi-day session's award is evaluated at
      -- COMPLETION, where the day set is final — a fourth day can still be
      -- added while the session is running, and a member paid for attending
      -- «every day» of a three-day workshop that became four was never paid
      -- correctly. Without this clause the rule would hold only while
      -- `check_in()` routes through attendance_recorded(): between this file
      -- and `checkin`'s switch of its three call sites, an inline enqueue
      -- would still pay at the last day's check-in. 0088's own principle —
      -- re-derive from the tables at run time, never trust the payload.
      -- ★ Inert at n = 1: one day is never more than one day.
      if (select count(*) from public.session_days d where d.session_id = v_sess) > 1
         and (select s.state from public.sessions s where s.id = v_sess)
             not in ('completed', 'archived') then
        return;
      end if;
      -- DEC-151: the key is the second line of defence, not the first. An
      -- award already standing for this session means nothing is owed, even
      -- under a key this call has never written.
      if exists (
        select 1 from public.points_ledger a
         where a.member_id = p_member and a.session_id = v_sess
           and a.source = 'check_in'
           and not exists (select 1 from public.points_ledger rv
                            where rv.source = 'reversal' and rv.source_id = a.id)
      ) then
        return;
      end if;
      -- `v1` until an attendance award for this session has been compensated;
      -- `v2` after the first, and so on. See section 1's header — this is what
      -- lets a member re-added after a removal be paid again, under a key the
      -- reversed award never held. With no reversal it is main's key exactly.
      v_epoch := public.attendance_award_epoch(v_sess, p_member);
    end if;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- attendee_bonus_epoch_guard (0121) — the presenter's per-attendee bonus,
  -- made safe against ANY caller, including `main`'s old worker.
  --
  -- ★ THE WINDOW THIS CLOSES. The owner pushes migrations, then merges;
  -- Vercel deploys at once and Railway only when its source is reconnected by
  -- hand, which has lagged three merges running. In that window a multi-day
  -- session can exist while `main`'s `award_presenter_points.ts` is still
  -- looping over ACTIVE CHECK-IN ROWS — so a three-day workshop would pay the
  -- presenter three bonuses per attendee, partial attendees included, onto a
  -- ledger nobody can delete from (invariant 9). The attendance award is
  -- merely late in that window and idempotent; this one could not be taken
  -- back cleanly, so it is refused here rather than trusted to the caller.
  --
  -- Two conditions, and BOTH are needed:
  --   * the source check-in is the attendee's epoch — the one row the bonus
  --     may name, so the old worker's other calls collapse to no-ops and the
  --     bonus stays paired with the attendee's own award for
  --     attendance_removed() to reverse together;
  --   * and that attendee actually attended the session. The epoch alone is
  --     not enough: attendance_epoch_check_in() returns the highest-position
  --     ACTIVE check-in whether or not the member is complete, so a member who
  --     came to days one and three of three has an epoch — day three's — and
  --     must still earn their presenter nothing.
  --
  -- ★ Provably inert at n = 1. One day means at most one active check-in per
  -- member (0100's per-day unique index), so an active source row IS the
  -- epoch, and «an active check-in on every day» is «has an active check-in».
  -- Both conditions hold for exactly the calls that write a row today.
  --
  -- The member here is the CHECK-IN's, never p_member — p_member is the
  -- presenter being paid. And the session is the check-in's own, not
  -- p_session: 0088's principle, re-derive from the table rather than trust
  -- the payload.
  --
  -- A source_id that is not a check-in at all writes nothing. It is a
  -- deliberate narrowing, not an oversight: 0087's reversal finds an
  -- attendee_bonus by the attendee's check-ins, so such a row could never be
  -- compensated — and on an append-only ledger a row that cannot be taken
  -- back is worse than a row that was never written.
  -- ═══════════════════════════════════════════════════════════════════════
  if p_source = 'attendee_bonus' then
    select c.session_id, c.member_id into v_sess, v_attendee
      from public.check_ins c where c.id = p_source_id;
    if v_attendee is null then
      return;
    end if;
    if not public.session_attendance_complete(v_sess, v_attendee) then
      return;
    end if;
    if p_source_id is distinct from public.attendance_epoch_check_in(v_sess, v_attendee) then
      return;
    end if;
  end if;

  -- Per-session cap (REQ-PTS-006). Expressed in occurrences in the schema
  -- (05 §3.2's footgun: cap_per_session * points is the point ceiling, not
  -- the occurrence count itself) — comparing against points-so-far keeps
  -- this correct even if a session mixes ledger rows written under two
  -- rule_versions with different point values.
  if r.cap_per_session is not null and p_session is not null then
    select coalesce(sum(amount), 0) into used from public.points_ledger
     where member_id = p_member and session_id = p_session and rule_key = p_rule;
    if used >= r.cap_per_session * r.points then
      return;
    end if;
  end if;

  -- Cooldown (REQ-PTS-007): inside the window, award nothing and fail nothing.
  if r.cooldown is not null and exists (
       select 1 from public.points_ledger
        where member_id = p_member and rule_key = p_rule
          and occurred_at > now() - r.cooldown) then
    return;
  end if;

  -- 05 §2.1's key: <rule_key>:<source>:<source_id>:<member_id>:v<epoch>.
  -- v_epoch is 1 for every rule but a re-awarded attendance (section 1).
  key := format('%s:%s:%s:%s:v%s', p_rule, p_source, p_source_id, p_member, v_epoch);

  insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                    reason, rule_key, rule_version, idempotency_key)
  values ((select org_id from public.members where id = p_member),
          p_member, r.points, p_source, p_source_id, p_session,
          r.reason_ar, p_rule, r.version, key)
  on conflict (idempotency_key) do nothing;            -- REQ-PTS-012: a replay writes zero rows
end $$;
