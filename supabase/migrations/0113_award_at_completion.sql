-- wave 9 (REQ-SES-017, DEC-119's «POINTS AND CERTIFICATES», DEC-151) — the
-- award moves to session completion for a multi-day session, and only there.
-- Promoted by the lead from supabase/proposed/scoring/0003_award_at_completion.sql.
--
-- ★ THE DECISION IS TWO FACTS UNDER A LOCK, NOT A KEY (DEC-151). The epoch
-- key — `check_in:check_in:<the member's latest active check-in>:<member>:v1` —
-- is the SECOND line of defence, and on its own it double-pays: the epoch
-- advances whenever a new active check-in appears, and that can happen while
-- the first award still STANDS.
--   * require_all_days = false: M attends day 1, is paid at completion keyed
--     CI1; the admin then corrects day 2's list and marks M present. A new
--     epoch, a new key, a second award, and nothing ever reversed L1.
--   * the same shape by removal: M attends days 1 and 3, paid keyed CI3;
--     CI3 is removed, the predicate still holds, so nothing is reversed;
--     the completion job replays and the epoch is now CI1 — a second award.
-- Under require_all_days it cannot happen, because a new active check-in
-- needs a day without one and there is none. Both cases are RLS cases in
-- tests/rls/scoring-days-award.test.ts.
-- So evaluate_member_attendance() reads *complete?* and *is one standing?*
-- under a per-(session, member) advisory lock, and the key only has to catch
-- a replay of the same decision.
--
-- ★ `n = 1` IS UNCHANGED, and that is checked rather than asserted:
--   * attendance_recorded() on a one-day session evaluates immediately, the
--     predicate holds, nothing is standing, and the epoch check-in is the only
--     check-in — so it enqueues `pts:check_in:<that row>` with main's exact
--     payload, which is what check_in() enqueues today.
--   * the completion pass then recomputes the same epoch and the same key, and
--     finds the award standing: it writes nothing. One proven no-op.
--   * award_points()' two new clauses cannot change a one-day outcome. The
--     predicate clause is implied by 0088's removed-check-in clause (with one
--     day, a named check-in that is not removed IS an active check-in on the
--     only day); the standing clause fires only on a replay, where
--     `on conflict do nothing` already wrote zero rows.
--
-- ★ THE TIMING DIFFERENCE IS IN A WRITER, NEVER IN A READER (wave-9 rule 1).
-- attendance_recorded() is the one place that knows a one-day session pays at
-- check-in and a multi-day one waits for completion. No reader branches on the
-- number of days.
--
-- Serves:  REQ-SES-017, REQ-PTS-006, REQ-PTS-011, REQ-PTS-012, REQ-PTS-013,
--          REQ-CHK-009, REQ-CHK-017, REQ-REC-002, REQ-REC-005, REQ-LDR-004,
--          invariant 9 · DEC-119, DEC-141, DEC-150 contracts 5 and 6, DEC-151
-- Cites:   scoring/0001 (attendance_recorded, attendance_removed — re-created
--          here with their real bodies), scoring/0002 (the predicate),
--          0028 + 0088 (award_points — re-created, two clauses added),
--          0031 (sessions_completion_fanout — NOT changed; the evaluation
--          folds into the evaluate_no_shows job it already enqueues),
--          0081 (evaluate_company_points — rule 2 corrected),
--          0087 (the reversal and the no-show symmetry),
--          0088 (evaluate_streaks, evaluate_badges — re-created),
--          0100 (session_days, require_all_days, the per-day unique index)
-- Docs:    docs/plan/notes/scoring.md "Wave 9 plan"
--
-- 03 §8.2 rows this adds:
--   | `RPC-evaluate_member_attendance.awards_once` | Complete and nothing standing awards exactly one attendance row; run again it writes nothing, whatever the epoch has become. |
--   | `RPC-evaluate_member_attendance.reverses_when_incomplete` | Not complete with one standing writes exactly one compensating `reversal`, with the caller's reason. |
--   | `RPC-evaluate_member_attendance.no_double_pay_on_new_epoch` | A new active check-in appearing while an award stands writes nothing — the `require_all_days = false` double-pay. |
--   | `RPC-evaluate_member_attendance.no_double_pay_on_replay` | Removing the epoch check-in while the predicate still holds, then replaying the completion pass, writes nothing. |
--   | `RPC-attendance_recorded.one_day_pays_at_check_in` | On a one-day session the hook enqueues main's job, under main's key, with main's payload. |
--   | `RPC-attendance_recorded.multi_day_waits` | On a multi-day session before completion the hook enqueues nothing, whatever days have been attended. |
--   | `RPC-attendance_recorded.after_completion_evaluates` | A member marked present after completion is evaluated at once, which is what pays a re-added member. |
--   | `RPC-evaluate_session_attendance.one_award_per_member` | A three-day workshop attended in full pays one attendance award, not three. |
--   | `RPC-evaluate_session_attendance.reverses_added_day` | A one-day award, then a second day added and missed, is reversed at completion with «لم يكتمل حضور جميع الأيام». |
--   | `RPC-award_points.requires_attendance_complete` | A late `award_points('check_in', …)` for a member who did not attend every day writes nothing. |
--   | `RPC-award_points.skips_when_award_standing` | The same call with an attendance award already standing for that session writes nothing. |
--   | `RPC-attendance_removed.no_show_only_when_none_left` | Removing one day of three records no `no_show`; removing the last active one does. |
--   | `RPC-attendance_removed.reverses_presenter_bonus_by_member` | The presenter's `attendee_bonus` for an attendee who no longer qualifies is reversed even when it is keyed to a different day's check-in. |
--   | `RPC-evaluate_streaks.counts_sessions_not_check_ins` | Three check-ins on one workshop count as one session toward a streak. |
--   | `RPC-evaluate_badges.counts_sessions_not_check_ins` | The same for the `check_ins_count` badge metric. |
--   | `RPC-evaluate_company_points.counts_members_not_check_ins` | A company's attendance share counts distinct members, and excludes a removed check-in (named difference 2). |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · which check-in an award names, and how a second award is possible
--
-- ★ NOT «the latest-created check-in», which is what this file said first and
-- what an hour of a failing suite disproved. `check_ins.created_at` and
-- `arrived_at` BOTH default to `now()` — the TRANSACTION's timestamp — so
-- every row a single transaction writes carries the same instant and «latest»
-- decays to `order by id`, which is a random uuid. It is the same defect
-- DEC-046 fixed on points_ledger with clock_timestamp(), and the same one
-- ad43ddb fixed in the realtime case at the top of this wave. In production
-- three days are three transactions and it would usually have worked, which
-- is the worst possible property for a rule about money.
--
-- So the award names THE CHECK-IN ON THE HIGHEST-POSITION DAY THE MEMBER
-- ATTENDED — «the check-in that completed the attendance» — which is a
-- function of the data and not of when rows happened to be written.
--   * At n = 1 it is the member's only check-in, so the award's source_id and
--     key are main's, without a branch.
--   * It is deterministic inside one transaction, so the RLS suite can prove it.
--
-- ★ A SECOND AWARD AFTER A REVERSAL IS MADE POSSIBLE BY THE KEY'S EPOCH
-- SEGMENT, not by this id. No choice of check-in can carry that on its own:
-- remove day one of three and re-add it, and the highest-position day is
-- unchanged — while `max(id)` or `min(id)` fail the mirror case. So
-- award_points() counts the reversals already written against this member's
-- attendance at this session and awards under `v1`, `v2`, … `05` §2.1 reserves
-- that segment for exactly this — «the same events produce new rows» when the
-- re-award is DELIBERATE rather than a replay — and an admin retracting an
-- attendance record and the member establishing it again is as deliberate as
-- it gets. With no reversal the segment is `v1`: main's key, byte for byte.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.attendance_epoch_check_in(p_session uuid, p_member uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id
    from public.check_ins c
    join public.session_days d on d.id = c.session_day_id
   where c.session_id = p_session and c.member_id = p_member and c.removed_at is null
   order by d.position desc, c.id desc
   limit 1
$$;

-- The generation: one more than the number of compensating rows already
-- written against this member's attendance awards for this session.
create function public.attendance_award_epoch(p_session uuid, p_member uuid) returns int
language sql stable security definer set search_path = '' as $$
  select 1 + count(*)::int
    from public.points_ledger rv
   where rv.source = 'reversal'
     and rv.source_id in (select a.id from public.points_ledger a
                           where a.member_id = p_member and a.session_id = p_session
                             and a.source = 'check_in')
$$;
revoke execute on function public.attendance_epoch_check_in(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.attendance_epoch_check_in(uuid, uuid) to service_role;
revoke execute on function public.attendance_award_epoch(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.attendance_award_epoch(uuid, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · the one routine — every decision about a member's attendance award
--
-- `p_reversal_reason` is the caller's, because the two reversals this can
-- write are two different events to a member reading their history: an admin
-- retracted the check-in, or a day was added that they did not attend.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.evaluate_member_attendance(
  p_session         uuid,
  p_member          uuid,
  p_reversal_reason text default 'أُلغي تسجيل الحضور'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_complete boolean;
  v_epoch    uuid;
  l          public.points_ledger;
begin
  -- One decision at a time per (session, member). Without it the completion
  -- job and an admin's manual mark can both read "nothing standing" and both
  -- award, and an append-only ledger cannot take that back — only compensate,
  -- visibly, forever.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_session::text || ':' || p_member::text, 0));

  v_complete := public.session_attendance_complete(p_session, p_member);

  if v_complete then
    -- FACT 2: is an attendance award already standing — one this session and
    -- member hold that no reversal points at? If so, nothing is owed,
    -- whatever the epoch has become.
    if exists (
      select 1 from public.points_ledger a
       where a.member_id = p_member and a.session_id = p_session
         and a.source = 'check_in'
         and not exists (select 1 from public.points_ledger rv
                          where rv.source = 'reversal' and rv.source_id = a.id)
    ) then
      return;
    end if;

    v_epoch := public.attendance_epoch_check_in(p_session, p_member);
    if v_epoch is null then
      return;   -- unreachable while complete; the predicate needs an active check-in
    end if;

    -- Enqueued, never awarded inline (11 §2.3): the member's own action must
    -- not wait on scoring, and this runs inside check_in() on the one-day path.
    perform public.enqueue_job(
      'award_points',
      jsonb_build_object('rule', 'check_in', 'member_id', p_member, 'source', 'check_in',
                          'source_id', v_epoch, 'session_id', p_session),
      'pts:check_in:' || v_epoch
    );
  else
    -- Not complete: every standing attendance award comes off. A LOOP, not a
    -- single row — between the owner's push and the merge, `main`'s worker
    -- runs on this schema and still awards once per check-in (contract 2), so
    -- a multi-day session can legitimately hold more than one.
    for l in
      select a.* from public.points_ledger a
       where a.member_id = p_member and a.session_id = p_session
         and a.source = 'check_in'
         and not exists (select 1 from public.points_ledger rv
                          where rv.source = 'reversal' and rv.source_id = a.id)
       order by a.occurred_at, a.id
    loop
      insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                        reason, rule_key, idempotency_key)
      values (l.org_id, l.member_id, -l.amount, 'reversal', l.id, l.session_id,
              p_reversal_reason, l.rule_key, 'reversal:' || l.id || ':v1')
      on conflict (idempotency_key) do nothing;
    end loop;
  end if;
end $$;
revoke execute on function public.evaluate_member_attendance(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.evaluate_member_attendance(uuid, uuid, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · the completion pass — one call per member with any attendance record
--
-- Folded into the `evaluate_no_shows` job (DEC-151 answer 4, 0081's own
-- precedent): sessions_completion_fanout() already enqueues exactly one per
-- completed session, under the key `noshow:<session_id>` that contract 2
-- requires not to change, and "evaluated once, at completion" is already that
-- job's contract. No new job type, no worker/src/index.ts registration.
--
-- Removed check-ins are included on purpose: a member whose every check-in was
-- retracted still needs a standing award taken off, and the reversal is
-- idempotent if attendance_removed() already wrote it.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.evaluate_session_attendance(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  for m in select distinct c.member_id from public.check_ins c where c.session_id = p_session
  loop
    perform public.evaluate_member_attendance(p_session, m.member_id, 'لم يكتمل حضور جميع الأيام');
  end loop;
end $$;
revoke execute on function public.evaluate_session_attendance(uuid) from public, anon, authenticated;
grant  execute on function public.evaluate_session_attendance(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · attendance_recorded — the ONE writer that knows about days
--
-- REQ-SES-017: «For a multi-day session the award is evaluated at session
-- completion, not at check-in… A one-day session is unchanged, because
-- attending every day is attending the one.» The day set is not final until
-- the session ends — a fourth day may still be added — which is why a
-- multi-day session cannot pay when its last known day is attended.
-- DEC-151 answer 6: it waits for completion even when require_all_days is
-- false, so the timing has one axis and not two.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.attendance_recorded(p_check_in uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ci     public.check_ins;
  s      public.sessions;
  v_days int;
begin
  select * into ci from public.check_ins where id = p_check_in;
  if not found then
    return;
  end if;
  select * into s from public.sessions where id = ci.session_id;
  if not found then
    return;
  end if;

  select count(*) into v_days from public.session_days d where d.session_id = ci.session_id;

  -- A one-day session pays at check-in, as it does today. A multi-day one
  -- waits for completion — and is evaluated at once if it is ALREADY
  -- completed, which is what pays a member an admin marks present afterwards
  -- (REQ-CHK-017) and what pays a member re-added after a removal.
  if v_days <= 1 or s.state in ('completed', 'archived') then
    perform public.evaluate_member_attendance(ci.session_id, ci.member_id);
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · attendance_removed — three movements, each scoped to the right thing
--
-- The attendee's own award is decided by the predicate (a removal on a
-- three-day workshop takes it away; on a session that does not require every
-- day it may not). The presenter's `attendee_bonus` follows the same
-- predicate but is keyed to whichever check-in was the epoch when it was paid,
-- which after this file need not be the row being removed. The no-show is
-- recorded only when the member has no active check-in left on ANY day:
-- a partial attendee is not a no-show (REQ-SES-017 says partial attendance
-- earns nothing; it does not say it is penalised).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.attendance_removed(p_check_in uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ci      public.check_ins;
  ledger  public.points_ledger;
  rsvp_id uuid;
begin
  select * into ci from public.check_ins where id = p_check_in;
  if not found then
    return;
  end if;

  perform public.evaluate_member_attendance(ci.session_id, ci.member_id, 'أُلغي تسجيل الحضور');

  if not public.session_attendance_complete(ci.session_id, ci.member_id) then
    for ledger in
      select l.* from public.points_ledger l
       where l.source = 'attendee_bonus'
         and l.source_id in (select c.id from public.check_ins c
                              where c.session_id = ci.session_id and c.member_id = ci.member_id)
         and not exists (select 1 from public.points_ledger rv
                          where rv.source = 'reversal' and rv.source_id = l.id)
    loop
      insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                        reason, rule_key, idempotency_key)
      values (ledger.org_id, ledger.member_id, -ledger.amount, 'reversal', ledger.id,
              ledger.session_id, 'أُلغي تسجيل الحضور', ledger.rule_key, 'reversal:' || ledger.id || ':v1')
      on conflict (idempotency_key) do nothing;
    end loop;
  end if;

  if not exists (select 1 from public.check_ins c
                  where c.session_id = ci.session_id and c.member_id = ci.member_id
                    and c.removed_at is null) then
    select id into rsvp_id from public.rsvps
     where session_id = ci.session_id and member_id = ci.member_id and status = 'confirmed';
    if rsvp_id is not null then
      perform public.award_points('no_show', ci.member_id, 'no_show', rsvp_id, ci.session_id);
    end if;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 · award_points — two clauses added for `source = 'check_in'`, nothing else
--
-- 0088's principle, extended: RE-DERIVE FROM check_ins AT RUN TIME rather
-- than trusting the payload. A job enqueued before a removal, before a day was
-- added, or before another path already paid must decide on what is true when
-- it runs. Both clauses are scoped to `source = 'check_in'`:
-- `attendee_bonus` deliberately keeps none, because it is filtered in
-- worker/src/tasks/award_presenter_points.ts where the attendee set is chosen.
--
-- Both are inert at n = 1 — see this file's header. And both need a session
-- to evaluate: a call with no session and no surviving check-in row falls
-- through to today's behaviour exactly, which is what the existing
-- RPC-award_points.idempotent case exercises.
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_sess  uuid;
  v_epoch int := 1;
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 7 · three check-ins on one workshop are ONE session attended
--
-- evaluate_streaks() and evaluate_badges() counted check_ins rows, which was
-- the same number as sessions attended until a session could have more than
-- one day. `count(distinct session_id)` is that same number at n = 1 — one
-- active check-in per session per member — so nothing moves for a one-day
-- session, and a three-day workshop stops being worth three.
-- Both are re-created from 0088 with that one expression changed.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.evaluate_streaks() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_period  date;
  v_count   int;
  v_award   uuid;
begin
  for r in
    select sr.id as rule_id, sr.org_id, sr.required_count, m.id as member_id, os.time_zone
      from public.streak_rules sr
      join public.org_settings os on os.org_id = sr.org_id
      join public.members m on m.org_id = sr.org_id and m.status = 'active'
     where sr.enabled
  loop
    v_period := date_trunc('month', (now() at time zone r.time_zone))::date;

    select count(distinct c.session_id) into v_count from public.check_ins c
     where c.member_id = r.member_id
       and c.removed_at is null
       and date_trunc('month', (c.arrived_at at time zone r.time_zone))::date = v_period;

    if v_count >= r.required_count then
      v_award := null;
      insert into public.streak_awards (org_id, member_id, rule_id, period_start)
      values (r.org_id, r.member_id, r.rule_id, v_period)
      on conflict (member_id, rule_id, period_start) do nothing
      returning id into v_award;

      if v_award is not null then
        perform public.award_points('streak_month', r.member_id, 'streak', v_award, null);
      end if;
    end if;
  end loop;
end $$;

-- evaluate_badges() — re-created from 0088, the `check_ins_count` metric
-- counting distinct sessions. Every other metric is untouched.
create or replace function public.evaluate_badges() returns void
language plpgsql security definer set search_path = '' as $$
declare
  b record;
  m record;
  v_metric        text;
  v_value         numeric;
  v_gte           numeric;
  v_min_sessions  numeric;
  v_sessions_done numeric;
begin
  for b in select * from public.badges where retired_at is null
  loop
    v_metric := b.rule ->> 'metric';
    if v_metric is null or v_metric = 'manual' then continue; end if;
    v_gte := (b.rule ->> 'gte')::numeric;

    for m in select id from public.members where org_id = b.org_id and status = 'active'
    loop
      if exists (select 1 from public.member_badges where member_id = m.id and badge_id = b.id) then
        continue;
      end if;

      v_value := case v_metric
        when 'check_ins_count' then
          -- ★ DISTINCT SESSIONS, not check-in rows: three check-ins on one
          -- three-day workshop are one session attended. Identical at n = 1,
          -- where a member has one active check-in per session.
          (select count(distinct session_id)::numeric from public.check_ins where member_id = m.id and removed_at is null)
        when 'sessions_delivered_count' then
          (select count(*)::numeric from public.session_presenters sp
             join public.sessions s on s.id = sp.session_id
            where sp.member_id = m.id and sp.accepted and s.state = 'completed')
        when 'ratings_submitted_count' then
          (select count(*)::numeric from public.ratings where member_id = m.id)
        when 'streak_awards_count' then
          (select count(*)::numeric from public.streak_awards where member_id = m.id)
        when 'presenter_rating_avg' then
          (select avg(r.session_stars) from public.ratings r
             join public.session_presenters sp on sp.session_id = r.session_id
            where sp.member_id = m.id and sp.accepted)
        else null
      end;
      if v_value is null then continue; end if;

      if v_metric = 'presenter_rating_avg' then
        v_min_sessions := coalesce((b.rule ->> 'min_sessions')::numeric, 0);
        select count(distinct sp.session_id)::numeric into v_sessions_done
          from public.session_presenters sp join public.sessions s on s.id = sp.session_id
         where sp.member_id = m.id and sp.accepted and s.state = 'completed';
        if v_sessions_done < v_min_sessions then continue; end if;
      end if;

      if v_value >= v_gte then
        insert into public.member_badges (org_id, member_id, badge_id)
        values (b.org_id, m.id, b.id)
        on conflict (member_id, badge_id) do nothing;
      end if;
    end loop;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8 · evaluate_company_points — rule 2 corrected (named difference 2)
--
-- Re-created from 0081 with ONE block changed; rules 1 and 3 are verbatim.
-- Rule 3 needs no change: session_presenters has one row per presenter per
-- session however many days it runs.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.evaluate_company_points(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s       public.sessions;
  r_host  public.company_scoring_rules;
  r_att   public.company_scoring_rules;
  r_pres  public.company_scoring_rules;
  v_key   text;
  v_pts   int;
  rec     record;
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    return;   -- the session row is gone; nothing to evaluate (DEC-059's terminal-row pattern)
  end if;

  select * into r_host from public.company_scoring_rules where org_id = s.org_id and action_key = 'company_hosting';
  select * into r_att  from public.company_scoring_rules where org_id = s.org_id and action_key = 'company_attendance_pct';
  select * into r_pres from public.company_scoring_rules where org_id = s.org_id and action_key = 'company_presenting_pct';

  -- Rule 1 — company_hosting: one flat award to the session's assigned
  -- host company, if one is assigned and the rule is enabled.
  -- `r_host.id is not null`, not `r_host is not null`: Postgres row-wise NULL
  -- semantics say a composite `IS NOT NULL` is true only when EVERY field is
  -- non-null, and a hosting rule's own shape (points_per_percent, cap_points,
  -- min_active_members all NULL by the CHECK above) makes that always false
  -- even when select-into found a real row. `.id` is never null once a row
  -- exists, so it is the reliable "was a row found" test — the same reason
  -- `select ... into s; if not found then return; end if;` above tests FOUND
  -- directly rather than `s is not null`.
  if r_host.id is not null and r_host.enabled and s.host_company_id is not null then
    v_key := format('company_hosting:session_delivered:%s:%s:v1', p_session, s.host_company_id);
    insert into public.company_points_ledger
      (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key)
    values (s.org_id, s.host_company_id, r_host.points, 'company_hosting', p_session, p_session,
            r_host.reason_ar, 'company_hosting', r_host.version, v_key)
    on conflict (idempotency_key) do nothing;
  end if;

  -- Rule 2 — company_attendance_pct: for every company with at least one
  -- checked-in member at THIS session, the share of that company's own
  -- active roster who attended (b, the open question in the header: scoped
  -- to any company, not just the session's host).
  if r_att.id is not null and r_att.enabled then
    for rec in
      -- ★ TWO CORRECTIONS, both named difference 2 (DEC-151 answer 3):
      --   * count(distinct ci.member_id), not count(*) — three check-ins on a
      --     three-day workshop are ONE member who attended, and count(*) would
      --     have tripled every company's share.
      --   * removed_at is null — 0088 corrected seven readers for DEC-141 and
      --     missed this one, so an admin's retracted check-in still counted
      --     toward its company's percentage. Byte-identical means no
      --     regression, not the preservation of a defect.
      -- Identical at n = 1 apart from the removal, which is the fix.
      select m.company_id,
             count(distinct ci.member_id) as attended,
             (select count(*) from public.members mm
               where mm.org_id = s.org_id and mm.status = 'active' and mm.company_id = m.company_id) as active
        from public.check_ins ci
        join public.members m on m.id = ci.member_id
       where ci.session_id = p_session and ci.removed_at is null and m.company_id is not null
       group by m.company_id
    loop
      if rec.active >= r_att.min_active_members then
        v_pts := least(r_att.cap_points, round((rec.attended::numeric / rec.active) * 100 * r_att.points_per_percent)::int);
        if v_pts > 0 then
          v_key := format('company_attendance_pct:session_completed:%s:%s:v1', p_session, rec.company_id);
          insert into public.company_points_ledger
            (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key, meta)
          values (s.org_id, rec.company_id, v_pts, 'company_attendance_pct', p_session, p_session,
                  r_att.reason_ar, 'company_attendance_pct', r_att.version, v_key,
                  jsonb_build_object('attended', rec.attended, 'active_members', rec.active,
                                      'percent', round((rec.attended::numeric / rec.active) * 100, 1)))
          on conflict (idempotency_key) do nothing;
        end if;
      end if;
    end loop;
  end if;

  -- Rule 3 — company_presenting_pct: same shape, over accepted
  -- session_presenters.
  if r_pres.id is not null and r_pres.enabled then
    for rec in
      select m.company_id,
             count(*) as presenting,
             (select count(*) from public.members mm
               where mm.org_id = s.org_id and mm.status = 'active' and mm.company_id = m.company_id) as active
        from public.session_presenters sp
        join public.members m on m.id = sp.member_id
       where sp.session_id = p_session and sp.accepted and m.company_id is not null
       group by m.company_id
    loop
      if rec.active >= r_pres.min_active_members then
        v_pts := least(r_pres.cap_points, round((rec.presenting::numeric / rec.active) * 100 * r_pres.points_per_percent)::int);
        if v_pts > 0 then
          v_key := format('company_presenting_pct:session_completed:%s:%s:v1', p_session, rec.company_id);
          insert into public.company_points_ledger
            (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key, meta)
          values (s.org_id, rec.company_id, v_pts, 'company_presenting_pct', p_session, p_session,
                  r_pres.reason_ar, 'company_presenting_pct', r_pres.version, v_key,
                  jsonb_build_object('presenting', rec.presenting, 'active_members', rec.active,
                                      'percent', round((rec.presenting::numeric / rec.active) * 100, 1)))
          on conflict (idempotency_key) do nothing;
        end if;
      end if;
    end loop;
  end if;
end $$;
