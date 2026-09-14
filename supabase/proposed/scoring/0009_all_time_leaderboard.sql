-- scoring/0009_all_time_leaderboard.sql — all_time_leaderboard() (05 §6.1,
-- REQ-LDR-001, REQ-LDR-008). STORY-LDR-001, closing the gap the other
-- three boards don't have: the all-time board reads live from
-- points_balances (no period, no denominator to freeze — 05 §6.1), and
-- points_balances' own RLS (P1, org-read) carries no opt-out awareness at
-- all, unlike leaderboard_entries' `boards_read` policy. A plain DAL query
-- against points_balances would therefore be an APPLICATION filter as the
-- only boundary for REQ-LDR-008 on this one board — exactly what CLAUDE.md
-- invariant 5 and "RLS is always on" rule out. This RPC enforces the same
-- opt-out rule leaderboard_entries' policy already does, in the database.
--
-- 03 §8.2 rows this adds:
--   RPC-all_time_leaderboard.opt_out — an opted-out member is absent from
--     another member's call, present in their own; a deactivated member
--     never appears at all (unlike a snapshot, which has no "still a
--     member" concept to check).
create function public.all_time_leaderboard()
returns table (member_id uuid, rank bigint, total_points int)
language sql security definer set search_path = '' as $$
  select pb.member_id, rank() over (order by pb.total_points desc), pb.total_points
    from public.points_balances pb
    join public.members m on m.id = pb.member_id
   where pb.org_id = public.auth_org_id()
     and m.status = 'active'
     and (not m.leaderboard_opt_out or m.id = public.auth_member_id())
   order by pb.total_points desc
$$;
revoke execute on function public.all_time_leaderboard() from public, anon;
grant  execute on function public.all_time_leaderboard() to authenticated;
