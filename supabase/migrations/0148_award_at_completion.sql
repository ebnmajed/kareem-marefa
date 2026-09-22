-- wave 12 (REQ-PTS-015, DEC-172, DEC-174) — every award a session earns is
-- paid when the session completes, and never before, whatever the number of
-- days. Needs 0006 (attendance_award_barred()).
--
-- ★ award_points() IS THE ONE PLACE THAT KNOWS WHEN. Every enqueuer — the
-- attendance hooks, the completion fan-out, the presenter trigger (0008), a
-- job queued before this migration, `main`'s worker in the deploy window —
-- can be early or late; the function re-derives the moment from
-- `sessions.state`, and for a presenter award also the presenter from
-- `session_presenters`, when it runs (0088's and 0121's principle). So no
-- worker task changes behaviour, and `main`'s worker on this schema does
-- exactly what the new one does.
--
-- ★ NO BRANCH ON THE NUMBER OF DAYS. 0113's one-day exception — «attendance_
-- recorded() is the one place that knows a one-day session pays at check-in»
-- — ends. The day count is no longer read for timing anywhere in this file;
-- session_attendance_complete() still decides WHETHER (REQ-SES-017).
--
-- What this file changes, function by function (every other line verbatim
-- from 0113 / 0121):
--   award_points()               the check_in timing clause for every session;
--                                the presenter bar on attendance (0006);
--                                the presenter sources re-derive the completed
--                                session and the accepted presenter; the
--                                presenter epoch (DEC-174 rulings 1, 5)
--   evaluate_member_attendance() the pay branch waits for completion; a
--                                re-award after a reversal re-runs the
--                                presenters' bonus (DEC-174 ruling 9)
--   attendance_recorded()        state only — the day count is gone
--   attendance_removed()         the no_show waits for completion (ruling 2)
--
-- Serves:  REQ-PTS-015, REQ-PTS-011, REQ-PTS-012, REQ-PTS-013, REQ-SES-017,
--          REQ-SES-019, REQ-CHK-011, REQ-CHK-017, invariant 9
-- Cites:   0113 (the four bodies re-created), 0121 (award_points' attendee
--          bonus guard, verbatim), 0087 (the reversal shape), 0006 (the bar)
-- Docs:    docs/plan/notes/scoring.md "Wave 12 plan" A1, A3
--
-- 03 §8.2 rows this adds:
--   | `POL-check_in.no_award_before_completion` | A code check-in and a manual mark on a running session — one day or three — enqueue no award job. |
--   | `RPC-award_points.waits_for_completion_at_any_n` | A `check_in` award on a session that is not completed or archived writes nothing, at one day as at three. |
--   | `RPC-evaluate_member_attendance.pays_only_after_completion` | The completion pass on a running session enqueues nothing; on a completed one it enqueues main's key and payload. |
--   | `RPC-attendance_removed.before_completion_writes_nothing` | Check in, remove, complete: no award, no reversal, and the no-show only from the completion pass. |
--   | `RPC-attendance_removed.no_show_after_completion_only` | A removal records the no-show only on a completed or archived session. |
--   | `RPC-award_points.presenter_earns_no_attendance` | An accepted presenter of the session is paid no attendance, whenever they checked in. |
--   | `RPC-award_points.presenter_sources_wait_for_completion` | `session_delivered`, `attendee_bonus`, `rating_bonus` and `proposal_accepted` write nothing before the session completes. |
--   | `RPC-award_points.presenter_must_be_accepted` | The same four write nothing to a member who is not an accepted presenter of the session when the job runs. |
--   | `RPC-award_points.presenter_epoch` | With no reversal a presenter award's key is today's (`…:v1`); after one it is `…:v2`. |
--   | `RPC-evaluate_member_attendance.readd_repays_presenter_bonus` | An attendee re-added after completion re-runs the presenters' award job under its existing key. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · the presenter epoch — one more than the reversals already written against
-- this family of award: (member, rule, source, source_id).
--
-- 0113's attendance_award_epoch() counts per SESSION because the award's
-- check-in may change between epochs. A presenter award's source_id does not
-- change — the session, the proposal, or the attendee's epoch check-in — so
-- the family is the key minus its epoch. With no reversal it is 1: today's key,
-- byte for byte. A row is only ever written under v(reversed + 1), which is
-- the key of the one that would already stand, so at most one stands.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.presenter_award_epoch(p_member uuid, p_rule text, p_source public.ledger_source, p_source_id uuid)
returns int
language sql stable security definer set search_path = '' as $$
  select 1 + count(*)::int
    from public.points_ledger rv
   where rv.source = 'reversal'
     and rv.source_id in (select a.id from public.points_ledger a
                           where a.member_id = p_member and a.rule_key = p_rule
                             and a.source = p_source and a.source_id is not distinct from p_source_id)
$$;
revoke execute on function public.presenter_award_epoch(uuid, text, public.ledger_source, uuid) from public, anon, authenticated;
grant  execute on function public.presenter_award_epoch(uuid, text, public.ledger_source, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1b · «was on the proposal» — one definition: award_points() below, and
-- 0008's fan-out and join trigger, all ask it.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.proposal_presenter(p_proposal uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_proposal is not null and (
    exists (select 1 from public.proposals p where p.id = p_proposal and p.proposer_id = p_member)
    or exists (select 1 from public.proposal_presenters pp
                where pp.proposal_id = p_proposal and pp.member_id = p_member
                  and pp.accepted and pp.declined_at is null)
  )
$$;
revoke execute on function public.proposal_presenter(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.proposal_presenter(uuid, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · award_points
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
  v_sess     uuid;
  v_epoch    int := 1;
  v_attendee uuid;
  v_proposal uuid;
begin
  select * into r from public.scoring_rules
   where org_id = (select org_id from public.members where id = p_member)
     and action_key = p_rule;
  if r is null or not r.enabled then
    return;                                            -- unknown/disabled rule: award nothing
  end if;

  if p_source = 'check_in' then
    -- DEC-141's late-job race (0088), unchanged.
    if exists (select 1 from public.check_ins where id = p_source_id and removed_at is not null) then
      return;
    end if;

    v_sess := coalesce(p_session, (select c.session_id from public.check_ins c where c.id = p_source_id));
    if v_sess is not null then
      -- ★ REQ-PTS-015: the moment, for EVERY session. 0121 held this for more
      -- than one day only; one day paid at check-in. A job enqueued early —
      -- by a hook, before this migration, or by `main`'s worker — returns here
      -- and the completion pass enqueues the same key again.
      if (select s.state from public.sessions s where s.id = v_sess) not in ('completed', 'archived') then
        return;
      end if;
      -- REQ-CHK-011: a presenter does not attend their own session. The ONE
      -- definition contract 1's session_award_state() also asks (0006), so the
      -- state a member reads and the award they get cannot disagree.
      if public.attendance_award_barred(v_sess, p_member) then
        return;
      end if;
      -- REQ-SES-017: attendance points require every day, by default.
      if not public.session_attendance_complete(v_sess, p_member) then
        return;
      end if;
      -- DEC-151: the standing award decides; the key is the second line.
      if exists (
        select 1 from public.points_ledger a
         where a.member_id = p_member and a.session_id = v_sess
           and a.source = 'check_in'
           and not exists (select 1 from public.points_ledger rv
                            where rv.source = 'reversal' and rv.source_id = a.id)
      ) then
        return;
      end if;
      v_epoch := public.attendance_award_epoch(v_sess, p_member);
    end if;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- attendee_bonus_epoch_guard (0121), verbatim — the presenter's per-attendee
  -- bonus names the attendee's epoch check-in, and only a complete attendee's.
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

  -- ═══════════════════════════════════════════════════════════════════════
  -- ★ PRESENTER AWARDS FOLLOW THE PRESENTER (REQ-SES-019, DEC-174 ruling 1).
  -- Re-derived when the job runs, never trusted from the payload:
  --   * the session is completed or archived — REQ-PTS-015's moment;
  --   * the member is an accepted, not declined, presenter of it NOW.
  -- The second is load-bearing: the fan-out queues a `:rating_bonus` job for
  -- +48 h, and a presenter removed in between has had session_delivered
  -- reversed — without this, that job would compute the next epoch and pay
  -- them again. `proposal_accepted` also needs the member to have been on the
  -- proposal (the proposer, or an accepted co-presenter of it).
  -- ═══════════════════════════════════════════════════════════════════════
  if p_source in ('session_delivered', 'attendee_bonus', 'rating_bonus', 'proposal_accepted') then
    if p_source = 'proposal_accepted' then
      select s.id, s.proposal_id into v_sess, v_proposal from public.sessions s where s.proposal_id = p_source_id;
    elsif p_source <> 'attendee_bonus' then
      v_sess := coalesce(p_session, p_source_id);   -- session_delivered / rating_bonus name the session
    end if;
    if v_sess is null
       or (select s.state from public.sessions s where s.id = v_sess) not in ('completed', 'archived') then
      return;
    end if;
    -- «Is an accepted presenter» — the same definition that bars attendance.
    if not public.attendance_award_barred(v_sess, p_member) then
      return;
    end if;
    if p_source = 'proposal_accepted' and not public.proposal_presenter(v_proposal, p_member) then
      return;
    end if;
    -- `v1` until this family has been compensated; then `v2`, … — what lets a
    -- presenter removed and re-added after completion be paid again.
    v_epoch := public.presenter_award_epoch(p_member, p_rule, p_source, p_source_id);
  end if;

  -- Per-session cap (REQ-PTS-006), unchanged. A reversal carries the same
  -- rule_key and session_id, so a reversed award frees its place.
  if r.cap_per_session is not null and p_session is not null then
    select coalesce(sum(amount), 0) into used from public.points_ledger
     where member_id = p_member and session_id = p_session and rule_key = p_rule;
    if used >= r.cap_per_session * r.points then
      return;
    end if;
  end if;

  -- Cooldown (REQ-PTS-007), unchanged.
  if r.cooldown is not null and exists (
       select 1 from public.points_ledger
        where member_id = p_member and rule_key = p_rule
          and occurred_at > now() - r.cooldown) then
    return;
  end if;

  -- 05 §2.1's key: <rule_key>:<source>:<source_id>:<member_id>:v<epoch>.
  key := format('%s:%s:%s:%s:v%s', p_rule, p_source, p_source_id, p_member, v_epoch);

  insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                    reason, rule_key, rule_version, idempotency_key)
  values ((select org_id from public.members where id = p_member),
          p_member, r.points, p_source, p_source_id, p_session,
          r.reason_ar, p_rule, r.version, key)
  on conflict (idempotency_key) do nothing;            -- REQ-PTS-012: a replay writes zero rows
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · evaluate_member_attendance — the pay branch waits for completion
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.evaluate_member_attendance(
  p_session         uuid,
  p_member          uuid,
  p_reversal_reason text default 'أُلغي تسجيل الحضور'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_complete boolean;
  v_epoch    uuid;
  l          public.points_ledger;
  p          record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_session::text || ':' || p_member::text, 0));

  v_complete := public.session_attendance_complete(p_session, p_member);

  if v_complete then
    -- ★ REQ-PTS-015: nothing is enqueued before the session completes, at any
    -- number of days. award_points() refuses it too; this keeps an early call
    -- from leaving a job that will only write nothing.
    if (select s.state from public.sessions s where s.id = p_session) not in ('completed', 'archived') then
      return;
    end if;

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
      return;
    end if;

    perform public.enqueue_job(
      'award_points',
      jsonb_build_object('rule', 'check_in', 'member_id', p_member, 'source', 'check_in',
                          'source_id', v_epoch, 'session_id', p_session),
      'pts:check_in:' || v_epoch
    );

    -- ★ DEC-174 ruling 9: an attendee RE-ADDED after completion (an attendance
    -- award of theirs was already reversed) re-earns their presenters' bonus.
    -- attendance_removed() reversed it; nothing else would pay it again. The
    -- presenters' own job under its own key — award_points() takes each
    -- bonus's next epoch. Only after a reversal, so the ordinary completion
    -- pass enqueues nothing more than it did.
    if public.attendance_award_epoch(p_session, p_member) > 1 then
      for p in select sp.member_id from public.session_presenters sp
                where sp.session_id = p_session and sp.accepted and sp.declined_at is null
      loop
        perform public.enqueue_job(
          'award_presenter_points',
          jsonb_build_object('session_id', p_session, 'member_id', p.member_id),
          'pts:presenter:' || p_session || ':' || p.member_id
        );
      end loop;
    end if;
  else
    -- Not complete: every standing attendance award comes off — whatever the
    -- state. Before completion this finds nothing but an award paid at check-in
    -- before DEC-172, and reversing that is correct.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · attendance_recorded — the state, and nothing about days
--
-- It evaluates only a session that has already ended: that is what pays a
-- member an admin marks present afterwards (REQ-CHK-017) and a member
-- re-added after a removal. Before completion the check-in is the trigger
-- (REQ-CHK-009); the completion pass is the payment (REQ-PTS-015).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.attendance_recorded(p_check_in uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ci public.check_ins;
  s  public.sessions;
begin
  select * into ci from public.check_ins where id = p_check_in;
  if not found then
    return;
  end if;
  select * into s from public.sessions where id = ci.session_id;
  if not found then
    return;
  end if;

  if s.state in ('completed', 'archived') then
    perform public.evaluate_member_attendance(ci.session_id, ci.member_id);
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · attendance_removed — the no-show waits for completion
--
-- REQ-PTS-015: «Before completion, removing an attendance record … leaves no
-- ledger row». The completion pass records the no-show for a confirmed RSVP
-- with no active check-in under this very key, so nothing is lost by waiting;
-- after completion that pass has already run, so the removal records it here.
-- The two reversal blocks are 0113's, verbatim.
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

  if (select s.state from public.sessions s where s.id = ci.session_id) in ('completed', 'archived')
     and not exists (select 1 from public.check_ins c
                      where c.session_id = ci.session_id and c.member_id = ci.member_id
                        and c.removed_at is null) then
    select id into rsvp_id from public.rsvps
     where session_id = ci.session_id and member_id = ci.member_id and status = 'confirmed';
    if rsvp_id is not null then
      perform public.award_points('no_show', ci.member_id, 'no_show', rsvp_id, ci.session_id);
    end if;
  end if;
end $$;
