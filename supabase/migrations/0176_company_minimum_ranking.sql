-- 0176 · wave 20, PR C (DEC-220 §1, DEC-222, REQ-UIX-082) — proposed by `scoring`, promoted by the lead.
-- scoring · wave 20, PR C (DEC-220 §1, DEC-222, REQ-UIX-082, STORY-UIX-072, REQ-LDR-006) — «بلا ترتيب».
--
-- `create or replace` of `snapshot_leaderboard()` (0081, scoring's own function), identical except two things, both in
-- the COMPANY branch:
--   1. the org's `company_min_active_members` (0175, the owner's setting — default 3) is FROZEN onto the company
--      snapshot's own `min_active_members` (0175), null for every other kind — so a final month or quarter keeps the
--      minimum it was ranked under, whatever the setting becomes (0027's guards forbid any later change);
--   2. companies with at least that many active members rank FIRST, by the metric; the rest after them, by the metric.
--      Every rank stays > 0 (0027:475); the board draws «بلا ترتيب» for a row below the snapshot's minimum (the DAL
--      derives the count exactly from the frozen pair — scoring's note §H).
-- The monthly, seasonal and topic branches, the denominator, the replace-in-place and the grants: byte-for-byte 0081.
--
-- ★ It reorders the MONTHLY race too, from the moment it is applied — provisional rows only; a final snapshot never
-- moves (DEC-220 §1.5, the owner's accepted consequence).
--
-- Additive for `main`: `main` never reads `min_active_members`; its board shows the new order, eligible first.
--
-- 03 §8.2 rows:
--   | `RPC-snapshot_leaderboard.min_frozen` | A company snapshot stores the org's minimum; changing the setting later changes no snapshot. |
--   | `RPC-snapshot_leaderboard.eligible_first` | Below-minimum companies rank after every eligible one; every rank stays > 0. |
--   | `RPC-snapshot_leaderboard.final_untouched` | A final company snapshot taken before the change keeps its order and its null minimum. |

create or replace function public.snapshot_leaderboard(
  p_org          uuid,
  p_kind         public.leaderboard_kind,
  p_period_start date default null,
  p_period_end   date default null,
  p_category_id  uuid default null,
  p_is_final     boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot_id  uuid;
  v_active_count int;
  v_metric       public.company_metric;
  v_min          int;
begin
  select count(*) into v_active_count from public.members where org_id = p_org and status = 'active';
  select company_metric, company_min_active_members into v_metric, v_min from public.org_settings where org_id = p_org;

  delete from public.leaderboard_snapshots
   where org_id = p_org and kind = p_kind
     and period_start is not distinct from p_period_start
     and period_end   is not distinct from p_period_end
     and category_id  is not distinct from p_category_id
     and not is_final;

  insert into public.leaderboard_snapshots (org_id, kind, period_start, period_end, category_id, metric, active_member_count, min_active_members, is_final)
  values (p_org, p_kind, p_period_start, p_period_end, p_category_id,
          case when p_kind = 'company' then v_metric else null end,
          v_active_count,
          case when p_kind = 'company' then v_min else null end,
          p_is_final)
  returning id into v_snapshot_id;

  if p_kind in ('monthly', 'seasonal') then
    insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points)
    select p_org, v_snapshot_id, totals.member_id, rank() over (order by totals.total desc), totals.total
      from (
        select member_id, sum(amount) as total
          from public.points_ledger
         where org_id = p_org
           and (p_period_start is null or occurred_at >= p_period_start::timestamptz)
           and (p_period_end   is null or occurred_at <  p_period_end::timestamptz)
         group by member_id
      ) totals
     where totals.total > 0;

  elsif p_kind = 'topic' then
    insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points)
    select p_org, v_snapshot_id, totals.member_id, rank() over (order by totals.total desc), totals.total
      from (
        select pl.member_id, sum(pl.amount) as total
          from public.points_ledger pl
          join public.sessions s on s.id = pl.session_id
         where pl.org_id = p_org and s.category_id = p_category_id
         group by pl.member_id
      ) totals
     where totals.total > 0;

  elsif p_kind = 'company' then
    insert into public.leaderboard_entries (org_id, snapshot_id, company_id, rank, points, points_per_active_member)
    select p_org, v_snapshot_id, agg.company_id,
           -- ★ wave 20, PR C (REQ-UIX-082): companies with at least the org's minimum of active members rank FIRST, the
           -- rest after them — every rank stays > 0 (0027:475), the cup's #1 is always eligible, and the minimum is
           -- frozen on the snapshot row above, so a final board never moves when the setting does.
           rank() over (order by (agg.active >= coalesce(v_min, 1)) desc,
                                 (case when v_metric = 'points_per_active_member' then agg.ppam else agg.total end) desc nulls last),
           agg.total, agg.ppam
      from (
        select c.id as company_id,
               coalesce(m_totals.total, 0) + coalesce(c_totals.total, 0) as total,
               (coalesce(m_totals.total, 0) + coalesce(c_totals.total, 0))::numeric / nullif(
                 (select count(*) from public.members mm where mm.org_id = p_org and mm.status = 'active' and mm.company_id = c.id),
                 0
               ) as ppam,
               (select count(*) from public.members mm where mm.org_id = p_org and mm.status = 'active' and mm.company_id = c.id) as active
          from public.companies c
          left join (
            select m.company_id, sum(pl.amount) as total
              from public.points_ledger pl
              join public.members m on m.id = pl.member_id
             where pl.org_id = p_org and m.company_id is not null
               and (p_period_start is null or pl.occurred_at >= p_period_start::timestamptz)
               and (p_period_end   is null or pl.occurred_at <  p_period_end::timestamptz)
             group by m.company_id
          ) m_totals on m_totals.company_id = c.id
          left join (
            select cl.company_id, sum(cl.amount) as total
              from public.company_points_ledger cl
             where cl.org_id = p_org
               and (p_period_start is null or cl.occurred_at >= p_period_start::timestamptz)
               and (p_period_end   is null or cl.occurred_at <  p_period_end::timestamptz)
             group by cl.company_id
          ) c_totals on c_totals.company_id = c.id
         where c.org_id = p_org and coalesce(m_totals.total, 0) + coalesce(c_totals.total, 0) <> 0
      ) agg;
  end if;

  return v_snapshot_id;
end $$;
revoke execute on function public.snapshot_leaderboard(uuid, public.leaderboard_kind, date, date, uuid, boolean)
  from public, anon, authenticated;
grant  execute on function public.snapshot_leaderboard(uuid, public.leaderboard_kind, date, date, uuid, boolean)
  to service_role;
