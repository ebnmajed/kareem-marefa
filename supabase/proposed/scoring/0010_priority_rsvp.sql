-- scoring/0010_priority_rsvp.sql — the priority_rsvp perk's head start
-- (05 §5.4, OQ-012, REQ-RSV-005, REQ-RSV-009, REQ-REC-006). STORY-RSV-005,
-- the perk M2 deferred ("perks don't exist yet, out of scope" —
-- docs/plan/notes/checkin.md §1.2).
--
-- Flagging before building, same as checkin did: reserve_seat() (0014,
-- `checkin`'s) carries no TODO(scoring, M4) marker, unlike check_in()'s.
-- The reason is structural, not an oversight — granting an early WINDOW
-- (not an after-the-fact side effect) has to change reserve_seat()'s own
-- accept/reject decision, which no trigger on `rsvps` can express (a
-- BEFORE INSERT trigger fires only once the RPC has already decided to
-- attempt the insert; the gate has to run before that decision). This is
-- a `create or replace` of an M2 RPC, exactly the second sanctioned hook
-- mechanism CLAUDE.md names, applied here without a marker because the
-- change genuinely could not exist before M4's perks did.
--
-- OQ-012's default: general RSVP opens `org_settings.priority_rsvp_hours`
-- (already a column, seeded 24 by M1) after the session's `published_at`.
-- A member holding an enabled, unrevoked `priority_rsvp` grant may reserve
-- before that; everyone else is refused with a distinct status until it
-- opens. Everything downstream — capacity, waitlist, idempotent re-submit —
-- is unchanged from 0014, which already produces "no displacement, no
-- waitlist jump" (REQ-RSV-009) for free: a perk holder reserving early is
-- the SAME insert a general reservation would be, just earlier, so a full
-- session waitlists them exactly like anyone else.
--
-- 03 §8.2 rows this adds:
--   POL-rsvps.priority_window — a member without the perk is refused
--     during the priority window; a member with it is not; after the
--     window everyone is treated identically, whether or not they hold it.
create or replace function public.reserve_seat(p_session uuid) returns public.rsvps
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  v_taken int;
  r public.rsvps;
  v_general_opens timestamptz;
  v_has_priority boolean;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if s.state <> 'published' then
    raise exception 'not_open' using errcode = '23514';               -- REQ-RSV-001: only published sessions
  end if;
  if s.rsvp_deadline_at is not null and now() > s.rsvp_deadline_at then
    raise exception 'deadline_passed' using errcode = '23514';        -- REQ-RSV-005
  end if;

  -- STORY-RSV-005 / OQ-012: the priority window, added at M4.
  if s.published_at is not null then
    select s.published_at + make_interval(hours => os.priority_rsvp_hours)
      into v_general_opens
      from public.org_settings os where os.org_id = m.org_id;
    if v_general_opens is not null and now() < v_general_opens then
      select exists (
        select 1 from public.member_perks mp
          join public.perks p on p.id = mp.perk_id
         where mp.member_id = m.id and p.key = 'priority_rsvp' and p.enabled and mp.revoked_at is null
      ) into v_has_priority;
      if not v_has_priority then
        raise exception 'rsvp_not_open_yet' using errcode = '23514';
      end if;
    end if;
  end if;

  select count(*) into v_taken from public.rsvps
   where session_id = p_session and status = 'confirmed';

  -- `on conflict (session_id, member_id)` makes double-submitting produce one
  -- row (REQ-RSV-001's idempotency). A row that is `cancelled`/`late_cancelled`
  -- is reactivated by the same statement; a `confirmed`/`waitlisted` row is
  -- left exactly as it is — this is not a re-roll of capacity on a repeat call.
  insert into public.rsvps as tgt (org_id, session_id, member_id, status, waitlist_position, reserved_at)
  values (
    s.org_id, p_session, m.id,
    case when v_taken < s.capacity then 'confirmed' else 'waitlisted' end::public.rsvp_status,
    case when v_taken < s.capacity then null
         else coalesce(
                (select max(waitlist_position) from public.rsvps
                  where session_id = p_session and status = 'waitlisted'),
                0
              ) + 1
    end,
    now()
  )
  on conflict (session_id, member_id) do update set
    status                = case when tgt.status in ('confirmed', 'waitlisted') then tgt.status else excluded.status end,
    waitlist_position     = case when tgt.status in ('confirmed', 'waitlisted') then tgt.waitlist_position else excluded.waitlist_position end,
    reserved_at           = case when tgt.status in ('confirmed', 'waitlisted') then tgt.reserved_at else now() end,
    cancelled_at          = case when tgt.status in ('confirmed', 'waitlisted') then tgt.cancelled_at else null end,
    was_late_cancellation = case when tgt.status in ('confirmed', 'waitlisted') then tgt.was_late_cancellation else false end,
    updated_at            = now()
  returning tgt.* into r;

  -- TODO(notify, M3): perform graphile_worker.add_job('calendar_upsert',
  --   json_build_object('rsvp_id', r.id), job_key => 'cal:' || r.id);
  return r;
end $$;
revoke execute on function public.reserve_seat(uuid) from public, anon;
grant  execute on function public.reserve_seat(uuid) to authenticated;
