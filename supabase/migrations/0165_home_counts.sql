-- 0165 · wave 18 (DEC-206 §4.54, DEC-207 §1.2) — two counts the home draws, each a NUMBER and never who.
--
-- Both are definer functions in `session_seat_counts()`'s pattern (0014): a member may
-- not read the rows they count, and must be able to read how many there are.
--   · `session_attendance_count()` — the lead's, as `checkin`'s custodian: how many
--     attended a session («28 حاضرًا», «23 من 40 حاضرًا الآن»);
--   · `monthly_ranked_count()` — `scoring`'s: how many a monthly snapshot ranks («#4 من 212»).
-- Promoted from `supabase/proposed/{checkin/w18_session_attendance_count,scoring/0002_monthly_ranked_count}.sql`,
-- unchanged. Additive for `main`: nothing on `main` names either.

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

-- scoring · wave 18 (DEC-207 §1.2, REQ-UIX-055, REQ-LDR-008) — «#4 من 212»: how many a board ranks.
--
-- The week on the home says a member's monthly rank «من N», and N is the count of
-- members the monthly snapshot ranks. A member cannot count them: `boards_read`
-- (0027) hides another member's row when they opted out, so the rows a member reads
-- can be FEWER than their own rank («#4 من 3»). This returns the number and nothing
-- else — no id, no name, no points. It reveals only how many opted-out members hold
-- points this month, which the gaps in the ranks a member already reads reveal.
--
-- `security definer` to count past `boards_read`; `stable`, no write. It refuses a
-- snapshot of another org by answering null — the same answer as «no such snapshot»,
-- so it cannot be used to probe another tenant's ids. Any board kind is counted
-- (the week asks for `monthly`); company rows are not members and are not counted.
--
-- Additive for `main`: nothing on `main` names it.
--

create function public.monthly_ranked_count(p_snapshot uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
           when exists (select 1 from public.leaderboard_snapshots s
                         where s.id = p_snapshot and s.org_id = public.auth_org_id())
           then (select count(*)::int from public.leaderboard_entries e
                  where e.snapshot_id = p_snapshot and e.member_id is not null)
         end;
$$;
revoke execute on function public.monthly_ranked_count(uuid) from public, anon;
grant  execute on function public.monthly_ranked_count(uuid) to authenticated;
