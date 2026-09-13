-- checkin/01_rsvp.sql — the RSVP RPCs (03 §5.3, STORY-RSV-001..004).
-- REQ-RSV-001, REQ-RSV-002, REQ-RSV-003, REQ-RSV-004, REQ-RSV-005, REQ-RSV-006,
-- REQ-RSV-007, REQ-RSV-008, REQ-RSV-010, REQ-RSV-011. DEC-040 (proposed by a
-- teammate, promoted by the lead).
--
-- `03` §8.2 rows: POL-rsvps.insert.rpc, POL-rsvps.reserve.capacity,
-- POL-rsvps.reserve.deadline, POL-rsvps.select.member.
--
-- `rsvps_read` and the table's `revoke all` / no insert-or-update policy
-- already exist (0010). Every write below is SECURITY DEFINER, opens with
-- assert_active_member() (0005's staleness pattern — a deactivated member or
-- a stale token is refused before anything else runs), and fully qualifies
-- every name under `set search_path = ''`.
--
-- Job enqueueing intentionally NOT here yet: the local database has no
-- `graphile_worker` schema (checked directly — the worker has never booted
-- against it; hosting is OQ-027, due M3). `calendar_upsert` (notify, M3) and
-- the notification for a promotion (REQ-RSV-004) are TODOs at the exact call
-- site below for whoever builds that schema. Nothing here is a workaround —
-- `promote_next_waitlisted` is real and atomic; only the downstream side
-- effects are deferred.

-- ═══════════════════════════════════════════════════════════════════════════
-- reserve_seat — REQ-RSV-001 / REQ-RSV-002. Capacity is enforced by locking
-- the session row, never by reading a count and trusting it.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.reserve_seat(p_session uuid) returns public.rsvps
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  v_taken int;
  r public.rsvps;
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

-- ═══════════════════════════════════════════════════════════════════════════
-- session_seat_counts — REQ-RSV-010's "counts are live" needs an aggregate
-- any member can read; `rsvps` itself is privacy-scoped to the owning member,
-- staff and the presenter (rsvps_read, 0010), so a plain count(*) against the
-- table is not something a member can run directly.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_seat_counts(p_session uuid) returns table(confirmed_count int, waitlist_count int)
language sql stable security definer set search_path = '' as $$
  select
    count(*) filter (where status = 'confirmed')::int,
    count(*) filter (where status = 'waitlisted')::int
  from public.rsvps
  where session_id = p_session
    and org_id = public.auth_org_id()
$$;
revoke execute on function public.session_seat_counts(uuid) from public, anon;
grant  execute on function public.session_seat_counts(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- promote_next_waitlisted — the reconciliation half of REQ-RSV-003. The
-- atomic case (a cancellation instantly promoting the next waitlisted
-- member, in the SAME transaction) is inline in cancel_rsvp() below, not
-- here — a queued job runs in a later transaction, which would reopen the
-- "no window where a seat is free but unassigned" gap the requirement
-- forbids. This function is for the OTHER way a seat frees: an admin
-- raising capacity via a plain UPDATE, which has no RPC to hang a
-- promotion off. service_role only (the worker's JOB-promote_waitlist);
-- cancel_rsvp() calls it too, as the function owner, same as every other
-- RPC in this codebase calling write_audit() despite its own restrictive
-- grant (0005).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.promote_next_waitlisted(p_session uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_confirmed int;
  promoted public.rsvps;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select count(*) into v_confirmed from public.rsvps
   where session_id = p_session and status = 'confirmed';
  if s.capacity is null or v_confirmed >= s.capacity then
    return null;
  end if;

  select * into promoted from public.rsvps
   where session_id = p_session and status = 'waitlisted'
   order by waitlist_position asc
   limit 1
   for update;
  if not found then
    return null;
  end if;

  update public.rsvps
     set status = 'confirmed', waitlist_position = null, promoted_at = now()
   where id = promoted.id;

  -- TODO(notify, M3): REQ-RSV-004 — MSG-rsvp_promoted + calendar_upsert for promoted.member_id.
  return promoted.id;
end $$;
revoke execute on function public.promote_next_waitlisted(uuid) from public, anon, authenticated;
grant  execute on function public.promote_next_waitlisted(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- cancel_rsvp — REQ-RSV-006 (any time, late past the cutoff), REQ-RSV-007
-- (late cancellation is a discrete recorded event), REQ-RSV-008 (leaving the
-- waitlist is never late), REQ-RSV-003 (promotion atomic with the freeing
-- cancellation, strict join order).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.cancel_rsvp(p_session uuid) returns public.rsvps
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  me public.rsvps;
  was_confirmed boolean;
  is_late boolean;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into me from public.rsvps where session_id = p_session and member_id = m.id for update;
  if not found then
    raise exception 'no_rsvp' using errcode = 'P0002';
  end if;
  if me.status in ('cancelled', 'late_cancelled') then
    return me;                                                        -- idempotent
  end if;

  was_confirmed := (me.status = 'confirmed');
  -- REQ-RSV-008: leaving the waitlist is NEVER late — only a confirmed seat can be.
  is_late := was_confirmed and s.cancellation_cutoff_at is not null and now() > s.cancellation_cutoff_at;

  update public.rsvps
     set status                = case when is_late then 'late_cancelled' else 'cancelled' end::public.rsvp_status,
         cancelled_at          = now(),
         was_late_cancellation = is_late,
         waitlist_position     = null
   where id = me.id
   returning * into me;

  if was_confirmed then
    -- Same transaction as the cancellation — REQ-RSV-003's atomicity.
    perform public.promote_next_waitlisted(p_session);
  end if;

  return me;
end $$;
revoke execute on function public.cancel_rsvp(uuid) from public, anon;
grant  execute on function public.cancel_rsvp(uuid) to authenticated;
