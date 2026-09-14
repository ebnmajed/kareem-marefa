-- promoted by the lead at wave-2 sync 10 · content, follow-up — REQ-MAT-005's "an admin download is always
-- permitted, and audited". The APP cannot write `audit_log` directly
-- (`POL-audit_log.insert`: direct insert is rejected for every role,
-- `write_audit()` succeeds — and `write_audit()` itself is granted to
-- `service_role` only, 0005). So the admin download flow is: the app calls
-- THIS RPC first (re-derives admin, writes the audit row through
-- write_audit() from inside a SECURITY DEFINER context), and only then
-- calls Storage's own `createSignedUrl()` — gated separately by 03 §6's
-- storage policy, which already lets an admin/presenter past
-- `allow_download = false`.
--
-- Serves:  REQ-MAT-005 ("An admin download is always permitted, and
--          audited"), REQ-ADM-018
-- Cites:   0005 (public.write_audit), 03 §6 ("Download control is a Storage
--          decision, not an RLS one")
--
-- 03 §8.2 row this adds:
--   | `RPC-record_material_download.admin_only` | A member and a
--     moderator are both refused `42501`; an admin writes one audit row
--     naming the material and the version. |
create function public.record_material_download(p_material_id uuid, p_version_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
begin
  if not public.is_org_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select org_id into v_org_id from public.materials where id = p_material_id and org_id = public.auth_org_id();
  if v_org_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform public.write_audit(
    v_org_id, 'material.downloaded', 'material', p_material_id,
    null, jsonb_build_object('version_id', p_version_id), null, 'admin', public.auth_member_id()
  );
end $$;
revoke all on function public.record_material_download(uuid, uuid) from public, anon;
grant execute on function public.record_material_download(uuid, uuid) to authenticated;
