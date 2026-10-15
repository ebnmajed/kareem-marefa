-- 0227 · An admin checks in any member, to any session, at any time (DEC-296, amends REQ-CHK-008).
--
-- The owner, 2026-10-15: «i want the admin to have the ability to manually checkin users to any event at anytime».
-- `mark_checked_in_manually()` already let an admin mark after the ceiling, with no limit; it still refused before the
-- day's start, and it accepted a session that was never published. Now: any time, on a published, running, completed
-- or archived session. A moderator keeps the code family's window, unchanged. Everything else is 0120's, verbatim —
-- the reason, the org, REQ-CHK-011 (a presenter never), one per day, the overlap refusal (REQ-CHK-013), the audit
-- row, and contract 5's two hooks, so a hand-mark earns exactly what a code check-in earns.
--
-- Forward-only: the same signature, replaced in place; its grants survive.
create or replace function public.mark_checked_in_manually(p_session uuid, p_member uuid, p_reason text, p_day uuid default null)
returns public.check_ins
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  d public.session_days;
  ci public.check_ins;
  existing public.check_ins;
  v_conflict uuid;
  v_range tstzrange;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  if m.org_role not in ('admin', 'moderator') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into s from public.sessions where id = p_session for update;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into d from public.session_days
   where id = coalesce(p_day, public.resolve_session_day(p_session, now()))
     and session_id = p_session;
  if p_day is not null and d.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if m.org_role = 'admin' then
    -- ★ DEC-296: an admin marks ANY member, at ANY time — before the day starts, during it, or long after the
    -- session (archived included, as in 0086: SCR-044 is a reconciliation screen). The only refusals are a
    -- session nobody can attend: cancelled, or not yet published.
    if s.state not in ('published', 'in_progress', 'completed', 'archived') or d.id is null then
      raise exception 'not_open' using errcode = '23514';
    end if;
  else
    if s.state not in ('published', 'in_progress', 'completed')
       or d.id is null
       or now() < d.starts_at
       or now() >= public.check_in_ceiling(d.id) then
      raise exception 'not_open' using errcode = '23514';
    end if;
  end if;

  if not exists (select 1 from public.members where id = p_member and org_id = s.org_id) then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.session_presenters
     where session_id = p_session and member_id = p_member and accepted
  ) then
    raise exception 'presenter_cannot_check_in' using errcode = '23514';   -- REQ-CHK-011 applies to manual too
  end if;

  select * into existing from public.check_ins
   where session_day_id = d.id and member_id = p_member and removed_at is null;
  if found then
    return existing;                                                       -- REQ-CHK-005, per day
  end if;

  v_range := tstzrange(d.starts_at, d.ends_at, '[)');
  begin
    insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
    values (s.org_id, p_session, d.id, p_member, 'manual', btrim(p_reason), m.id)
    returning * into ci;
  exception when exclusion_violation then
    select session_id into v_conflict from public.check_ins
     where member_id = p_member and session_window && v_range and removed_at is null
     limit 1;
    raise exception 'overlapping_session:%', v_conflict using errcode = '23P01';
  end;

  perform public.write_audit(s.org_id, 'check_in.manual', 'check_in', ci.id, null,
           jsonb_build_object('member_id', p_member, 'reason', p_reason), p_reason, null, m.id);

  -- ★ CONTRACT 5. The same call `check_in()` makes — which is the point:
  -- REQ-CHK-008's «exactly the same rights as a code check-in» stops being a
  -- claim two functions must keep in step and becomes one call site each.
  perform public.attendance_recorded(ci.id);
  perform public.attendance_certificate_sync(p_session, p_member);

  return ci;
end $$;
