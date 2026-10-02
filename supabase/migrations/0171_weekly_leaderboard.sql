-- 0171 · wave 20 — proposed by `scoring`, promoted by the lead. (`0170` is reserved for `retry_calendar_sync()`, which `DEC-218` named first.)
-- scoring · wave 20 (DEC-216 §2.2, DEC-217 §3.3 – §3.4, DEC-218, REQ-UIX-078, REQ-LDR-007, REQ-LDR-008) — this week, live.
--
-- The owner ruled on 2026-10-02 that the boards' new first window, «هذا الأسبوع», is summed LIVE from
-- `points_ledger` at read time: no `leaderboard_kind` value, no snapshot, no scheduled job. Two functions:
--
--   · `org_week(p_at)` — the caller's org's week containing `p_at`: Saturday to Friday in the org's own time zone
--     (`org_settings.time_zone`), as `Board.dc.html`'s «حتى الجمعة» draws it (DEC-217 §3.4 — the owner may move the
--     boundary; it is this one function). Invoker: it reads `org_settings` under `p1_org_read` and computes.
--     `p_at` exists so the boundary can be tested; it reveals nothing — it is arithmetic on a date.
--
--   · `weekly_leaderboard()` — the current week's standings. `security definer` because `points_ledger`'s own RLS is
--     self-or-admin (`03` §5.7a), exactly as `all_time_leaderboard()` (0044) is, and it follows 0044's rule to the
--     letter: active members only; an opted-out member absent from every call but their own (REQ-LDR-008); the rank
--     computed over what THAT caller may see, so a board has no gaps; and the snapshots' rule that a net of 0 or less
--     is not ranked (0042). It names the caller's org only (REQ-LDR-007) and writes nothing.
--
-- ★ What a balance or a rank IS does not change: these are the ledger's own rows, summed. A reversal in the week
--   counts in the week it was written, as it does in a month (0042).
--
-- Additive for `main`: nothing on `main` names either function.
--
-- 03 §8.2 rows:
--   | `RPC-org_week.boundary` | The week starts at Saturday 00:00 in the org's zone and ends before the next Saturday 00:00; a Friday 23:59 is in it. |
--   | `RPC-weekly_leaderboard.window` | Only rows written inside the current `org_week()` count; last week's do not. |
--   | `RPC-weekly_leaderboard.opt_out` | An opted-out member is absent from another member's call and present in their own. |
--   | `RPC-weekly_leaderboard.active` | A deactivated member never appears. |
--   | `RPC-weekly_leaderboard.org` | Another org's ledger never appears. |
--   | `RPC-weekly_leaderboard.net_positive` | A net of 0 or less this week is not ranked. |
--   | `RPC-week.anon` | anon cannot execute either function. |

create function public.org_week(p_at timestamptz default now())
returns table (week_start date, week_end date, starts_at timestamptz, ends_at timestamptz, time_zone text)
language sql stable security invoker set search_path = '' as $$
  with tz as (
    select coalesce(
             (select s.time_zone from public.org_settings s where s.org_id = public.auth_org_id()),
             'Asia/Riyadh'
           ) as name
  ), w as (
    -- extract(dow): Sunday 0 … Saturday 6, so the days since the last Saturday are (dow + 1) % 7.
    select tz.name, d.today - ((extract(dow from d.today)::int + 1) % 7) as start_day
      from tz, lateral (select (p_at at time zone tz.name)::date as today) d
  )
  select w.start_day,
         w.start_day + 6,
         w.start_day::timestamp at time zone w.name,
         (w.start_day + 7)::timestamp at time zone w.name,
         w.name
    from w
$$;
revoke execute on function public.org_week(timestamptz) from public, anon;
grant  execute on function public.org_week(timestamptz) to authenticated;

create function public.weekly_leaderboard()
returns table (member_id uuid, rank bigint, points int)
language sql stable security definer set search_path = '' as $$
  with w as (
    select ow.starts_at, ow.ends_at from public.org_week() ow
  ), totals as (
    select pl.member_id, sum(pl.amount)::int as total
      from public.points_ledger pl, w
     where pl.org_id = public.auth_org_id()
       and pl.occurred_at >= w.starts_at
       and pl.occurred_at <  w.ends_at
     group by pl.member_id
    having sum(pl.amount) > 0
  )
  select t.member_id, rank() over (order by t.total desc), t.total
    from totals t
    join public.members m on m.id = t.member_id
   where m.status = 'active'
     and (not m.leaderboard_opt_out or m.id = public.auth_member_id())
   order by 2, t.member_id
$$;
revoke execute on function public.weekly_leaderboard() from public, anon;
grant  execute on function public.weekly_leaderboard() to authenticated;
