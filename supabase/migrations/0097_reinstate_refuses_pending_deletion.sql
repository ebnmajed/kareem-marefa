-- supabase/migrations/0097_reinstate_refuses_pending_deletion.sql — promoted by the lead from
-- supabase/proposed/platform/0010_reinstate_refuses_pending_deletion.sql (wave 8, DEC-148).
--
-- platform (wave 8) — a deletion once requested cannot be undone by reinstating.
-- Follows `0005` (`reinstate_org()`) and `0069` (`delete_org()`,
-- `platform_org_metrics`).
--
-- Serves:  REQ-NFR-014 (deletion is irreversible, distinct from suspension),
--          REQ-TEN-006 (suspension is reversible), REQ-ADM-001
-- Cites:   12 §5.5, 16 §3 principle 7, DEC-052, DEC-148
--
-- ── The window this closes (platform's P2 finding, ruled at sync 3) ─────────
-- `delete_org()` suspends the org (reason `pending_deletion`, or keeps an
-- existing suspension), writes `org.deletion_requested` to `platform_audit_log`
-- and enqueues `JOB-delete_org`. Until the job runs, the org is an ordinary
-- suspended org — and `reinstate_org()` accepted it. A reinstate in that window
-- left an ACTIVE org, members signing in, that the queued job then deleted.
--
-- ── The marker is the one `delete_org()` already writes ───────────────────
-- No column. `org.deletion_requested` in `platform_audit_log` is written in the
-- same transaction as the suspension and the enqueue, and that table outlives
-- the org by design (DEC-054). While the org row still exists, a requested
-- deletion is by definition not yet complete; once the job succeeds the org is
-- gone and there is nothing to reinstate. A job that fails does not reopen the
-- door: the deletion was confirmed with the slug typed back, and REQ-NFR-014
-- calls it irreversible — a failed job is retried (11 §2.4), not cancelled.
-- (The queued job was the other candidate marker; it lives in a schema that may
-- be absent (`0025`) and disappears on success, so it cannot be the evidence.)
--
-- ── What changes ──────────────────────────────────────────────────────────
-- 1. `reinstate_org()` — `0005`'s body verbatim, behind one refusal:
--    `org_deletion_pending` (42501). Grants are kept by `create or replace`.
-- 2. `platform_org_metrics` gains `deletion_pending` at the END of its select
--    list (a view can only append), so SCR-080 offers no «أعد التفعيل» — and no
--    second deletion or suspension — for an org on its way out (principle 7).
--    It is platform metadata about the org, not org content (REQ-ADM-003); the
--    view's pinned column list gains exactly that name.
--    `platform_metrics_by_org()` is re-stated unchanged so it is plain that it
--    returns the widened row.
-- 3. `platform_org()` (`0070`) builds SCR-082's `counts` from the same view by
--    subtracting the metadata columns, so the new boolean would have arrived as
--    a «count». It is re-created to subtract it there and to carry it as its own
--    key, `deletionPending`, so SCR-082 can say so and stop offering edits to an
--    org on its way out.
--
-- ── 03 §8.2 rows this file needs ──────────────────────────────────────────
--   | `RPC-reinstate_org.pending_deletion` | After `delete_org()` for an org,
--     `reinstate_org()` is refused `org_deletion_pending`, the org stays
--     suspended and no `org.reinstated` is written; a suspended org with no
--     deletion requested still reinstates; `platform_metrics_by_org()` reports
--     `deletion_pending` true for the first and false for the second, and
--     `platform_org()` carries `deletionPending` outside its `counts`. |

create or replace function public.reinstate_org(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.assert_platform_admin();
begin
  if exists (
    select 1 from public.platform_audit_log a
     where a.action = 'org.deletion_requested' and a.subject_org = p_org
  ) then
    raise exception 'org_deletion_pending' using errcode = '42501';
  end if;

  update public.orgs
     set status = 'active', suspended_at = null, suspended_reason = null
   where id = p_org and status = 'suspended';
  if not found then
    raise exception 'org_not_found_or_active' using errcode = '42501';
  end if;
  perform public.write_audit(p_org, 'org.reinstated', 'org', p_org,
                             jsonb_build_object('status', 'suspended'), jsonb_build_object('status', 'active'),
                             null, 'platform_admin', null);
end $$;

create or replace view public.platform_org_metrics as
  select o.id                                        as org_id,
         o.name,
         o.slug,
         o.status,
         o.created_at,
         (select count(*) from public.members m where m.org_id = o.id)                              as members,
         (select count(*) from public.members m where m.org_id = o.id and m.status = 'active')      as active_members,
         (select count(*) from public.sessions s where s.org_id = o.id)                             as sessions,
         (select count(*) from public.sessions s where s.org_id = o.id and s.state = 'published')   as published_sessions,
         (select count(*) from public.sessions s where s.org_id = o.id and s.state = 'completed')   as completed_sessions,
         (select count(*) from public.certificates c where c.org_id = o.id)                         as certificates,
         (select count(*) from public.design_templates t where t.org_id = o.id)                     as org_templates,
         exists (select 1 from public.platform_audit_log a
                  where a.action = 'org.deletion_requested' and a.subject_org = o.id)               as deletion_pending
    from public.orgs o;
revoke all on public.platform_org_metrics from anon, authenticated, service_role;

create or replace function public.platform_metrics_by_org() returns setof public.platform_org_metrics
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_platform_admin();
  return query select * from public.platform_org_metrics m order by m.created_at desc;
end $fn$;
revoke execute on function public.platform_metrics_by_org() from public, anon;
grant  execute on function public.platform_metrics_by_org() to authenticated;

create or replace function public.platform_org(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare o public.orgs; v_domains jsonb; v_counts jsonb; v_pending boolean;
begin
  perform public.assert_platform_admin();

  select * into o from public.orgs where id = p_org;
  if o.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(d.domain::text order by d.domain), '[]'::jsonb)
    into v_domains
    from public.org_domains d where d.org_id = p_org;

  -- Counts only. The metrics view is the one place a column list has to be
  -- read to know what a super admin can see, so this reuses it rather than
  -- growing a second select list nobody diffs (REQ-ADM-003).
  select to_jsonb(m) - 'org_id' - 'name' - 'slug' - 'status' - 'created_at' - 'deletion_pending',
         m.deletion_pending
    into v_counts, v_pending
    from public.platform_org_metrics m where m.org_id = p_org;

  return jsonb_build_object(
    'id',                o.id,
    'name',              o.name,
    'slug',              o.slug,
    'status',            o.status,
    'certificatePrefix', o.certificate_prefix,
    'firstAdminEmail',   o.first_admin_email,
    'suspendedAt',       o.suspended_at,
    'suspendedReason',   o.suspended_reason,
    'createdAt',         o.created_at,
    'deletionPending',   coalesce(v_pending, false),
    'domains',           v_domains,
    'counts',            coalesce(v_counts, '{}'::jsonb)
  );
end $fn$;
revoke execute on function public.platform_org(uuid) from public, anon;
grant  execute on function public.platform_org(uuid) to authenticated;
