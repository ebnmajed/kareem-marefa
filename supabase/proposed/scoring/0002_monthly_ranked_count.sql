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
-- 03 §8.2 rows:
--   | `RPC-monthly_ranked_count.counts_hidden` | Counts every member entry of the snapshot, an opted-out member's included, though the caller cannot read that row. |
--   | `RPC-monthly_ranked_count.members_only` | Company entries are not counted. |
--   | `RPC-monthly_ranked_count.foreign_org` | A snapshot of another org answers null, as an unknown id does. |
--   | `RPC-monthly_ranked_count.anon` | anon cannot execute it. |

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
