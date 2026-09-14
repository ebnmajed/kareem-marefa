-- promoted by the lead at wave-2 sync 3 · scoring/0006_audit_balances.sql — JOB-audit_balances (11 §2.3, REQ-PTS-011,
-- 05 §4.1) and the safe rebuild it recommends as the first response.
-- STORY-PTS-006.
--
-- Both functions are service_role-only: points_ledger and points_balances
-- grant select to `authenticated` only (03 §5.7a/§4.9), so the worker needs
-- a SECURITY DEFINER door to read them at all, the same asymmetry every
-- other worker-facing RPC in this schema already has.
--
-- audit_balances() never writes to points_balances — it only reports.
-- "A rollup that silently corrects itself hides the bug that caused the
-- divergence" (05 §4.1). rebuild_points_balances() is the separate,
-- explicit, safe response: truncate-and-resum, which is always correct
-- because the ledger is insert-only (05 §2.3, §4.2).
--
-- 03 §8.2 rows this adds:
--   RPC-audit_balances.service_role_only  — no client role may call it.
--   RPC-audit_balances.no_self_heal       — a divergence is reported, not
--     corrected; points_balances is unchanged by calling it.
--   RPC-rebuild_points_balances.reproduces — truncate + resum always
--     reproduces the same totals a correct rollup would already show.

create function public.audit_balances()
returns table (org_id uuid, member_id uuid, expected_total int, actual_total int,
               expected_last_entry_id uuid, actual_last_entry_id uuid)
language sql security definer set search_path = '' as $$
  select b.org_id, b.member_id,
         coalesce(l.total, 0)             as expected_total,
         b.total_points                   as actual_total,
         l.last_id                        as expected_last_entry_id,
         b.last_entry_id                  as actual_last_entry_id
    from public.points_balances b
    left join (
      select member_id, sum(amount) as total, (array_agg(id order by occurred_at desc))[1] as last_id
        from public.points_ledger
       group by member_id
    ) l on l.member_id = b.member_id
   where coalesce(l.total, 0) <> b.total_points
      or l.last_id is distinct from b.last_entry_id
$$;
revoke execute on function public.audit_balances() from public, anon, authenticated;
grant  execute on function public.audit_balances() to service_role;

create function public.rebuild_points_balances() returns void
language plpgsql security definer set search_path = '' as $$
begin
  truncate public.points_balances;
  insert into public.points_balances (org_id, member_id, total_points, last_entry_id)
  select org_id, member_id, sum(amount), (array_agg(id order by occurred_at desc))[1]
    from public.points_ledger
   group by org_id, member_id;
end $$;
revoke execute on function public.rebuild_points_balances() from public, anon, authenticated;
grant  execute on function public.rebuild_points_balances() to service_role;
