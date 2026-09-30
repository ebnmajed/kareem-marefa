-- wave 18 (DEC-206 §4.54, DEC-207) — how many attended a session: a COUNT, never who.
--
-- The home's recap («28 حاضرًا») and the live post («23 من 40 حاضرًا الآن») draw the
-- figure, and `09` SCR-012 already lists «check-in count» as a member-visible live value.
-- `check_ins` is readable by oneself, staff and the session's presenters only
-- (`checkins_read`, 0010), and that stays: A33 rule 3 — «a member cannot see who else
-- attended». So the count is one definer function in the pattern of
-- `session_seat_counts()` (0014): a number and nothing else, in the caller's own org.
--
-- Distinct members, so a multi-day session counts a person once; a check-in an admin
-- removed (`removed_at`, 0087) does not count, as on the admin dashboard.
-- Written by the lead as `checkin`'s custodian; promoted after 0164.
create function public.session_attendance_count(p_session uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct c.member_id)::int
    from public.check_ins c
   where c.session_id = p_session
     and c.org_id = public.auth_org_id()
     and c.removed_at is null
$$;
revoke execute on function public.session_attendance_count(uuid) from public, anon;
grant  execute on function public.session_attendance_count(uuid) to authenticated;
