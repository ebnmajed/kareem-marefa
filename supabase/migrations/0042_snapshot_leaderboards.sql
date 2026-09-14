-- promoted by the lead at wave-2 sync 6 · scoring/0008_snapshot_leaderboards.sql — snapshot_leaderboard()
-- (11 §2.3 JOB-snapshot_leaderboards, REQ-LDR-002, REQ-LDR-006, A11,
-- DEC-016, 05 §6). STORY-LDR-001…004.
--
-- One parameterised RPC rather than four board-specific ones: monthly,
-- seasonal and topic snapshots are the same shape (sum the ledger, rank,
-- freeze), and the company snapshot adds exactly the one thing 05 §6.2
-- requires — active_member_count frozen at snapshot time, because a live
-- denominator lets deactivating one member retroactively rewrite last
-- quarter's standings. The all-time board (05 §6.1) is deliberately NOT
-- snapshotted here: it has no period and no denominator, so it is
-- computed live from points_balances in the DAL.
--
-- 03 §8.2 rows this adds:
--   RPC-snapshot_leaderboard.service_role_only — no client role may call it.
--   RPC-snapshot_leaderboard.frozen_denominator — active_member_count on a
--     company snapshot never changes after it is taken, even if a member
--     is later deactivated.
--   RPC-snapshot_leaderboard.provisional_replace — re-running for the same
--     (org, kind, period_start, period_end, category_id) before it is
--     final replaces the entries; after is_final it cannot be re-run at
--     all (the table's own immutability trigger, 0027, refuses the
--     necessary delete).
--   POL-leaderboard_entries.opt_out_at_write — an opted-out member's row is
--     still written (REQ-LDR-008: they still count toward their company's
--     total and still see their own rank) — the RLS policy is what hides
--     it from other members, not the snapshot itself.
create function public.snapshot_leaderboard(
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
begin
  select count(*) into v_active_count from public.members where org_id = p_org and status = 'active';
  select company_metric into v_metric from public.org_settings where org_id = p_org;

  -- A provisional snapshot at this natural key is replaced in place; a
  -- final one refuses the delete (0027's leaderboard_snapshots_guard),
  -- which is the "cannot re-run once final" rule enforced by the schema
  -- rather than by this function remembering to check.
  delete from public.leaderboard_snapshots
   where org_id = p_org and kind = p_kind
     and period_start is not distinct from p_period_start
     and period_end   is not distinct from p_period_end
     and category_id  is not distinct from p_category_id
     and not is_final;

  insert into public.leaderboard_snapshots (org_id, kind, period_start, period_end, category_id, metric, active_member_count, is_final)
  values (p_org, p_kind, p_period_start, p_period_end, p_category_id,
          case when p_kind = 'company' then v_metric else null end,
          v_active_count, p_is_final)
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
           rank() over (order by (case when v_metric = 'points_per_active_member' then agg.ppam else agg.total end) desc nulls last),
           agg.total, agg.ppam
      from (
        select m.company_id,
               sum(pl.amount) as total,
               sum(pl.amount)::numeric / nullif(
                 (select count(*) from public.members mm where mm.org_id = p_org and mm.status = 'active' and mm.company_id = m.company_id),
                 0
               ) as ppam
          from public.points_ledger pl
          join public.members m on m.id = pl.member_id
         where pl.org_id = p_org and m.company_id is not null
           and (p_period_start is null or pl.occurred_at >= p_period_start::timestamptz)
           and (p_period_end   is null or pl.occurred_at <  p_period_end::timestamptz)
         group by m.company_id
      ) agg;
  end if;

  return v_snapshot_id;
end $$;
revoke execute on function public.snapshot_leaderboard(uuid, public.leaderboard_kind, date, date, uuid, boolean)
  from public, anon, authenticated;
grant  execute on function public.snapshot_leaderboard(uuid, public.leaderboard_kind, date, date, uuid, boolean)
  to service_role;
