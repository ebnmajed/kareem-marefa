-- console (wave 3, M7) — write_admin_export_audit(), REQ-ADM-017's "every
-- export is audited."
--
-- Serves:  01 §20 REQ-ADM-017, REQ-CHK-012's CSV acceptance
-- Cites:   03 §1.3 (the staleness pattern), 0005's write_audit()/
--          assert_fresh_admin(), 04 §4.2 (uploads and CSV exports stream
--          from a Route Handler, never an action)
--
-- An export is a bulk read of personal data, so REQ-ADM-017 audits the ACT
-- OF EXPORTING itself — there is no product-table write an RLS policy could
-- gate for "this select is an export." The Route Handler (never a Server
-- Action) calls this once per export, after the caller is confirmed a
-- fresh admin, and writes exactly one `audit_log` row naming what left the
-- system. `assert_fresh_admin()` is the real gate, re-checked here exactly
-- as every other privileged write in this product re-checks it — a route
-- handler's own role check (present, for the early 404) is defence in
-- depth, never the boundary. Generic across every export this track ships
-- (SCR-044's attendance CSV first, SCR-061's org-wide exports next), so it
-- takes a plain export-type label rather than one function per export.
create function public.write_admin_export_audit(
  p_export_type  text,
  p_subject_type text default null,
  p_subject_id   uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_fresh_admin();
  v_id  uuid;
begin
  v_id := public.write_audit(actor.org_id, 'export.created', p_subject_type, p_subject_id,
                              null, jsonb_build_object('export_type', p_export_type), null,
                              'admin', actor.id);
  return v_id;
end $$;
revoke execute on function public.write_admin_export_audit from public, anon;
grant  execute on function public.write_admin_export_audit to authenticated;
