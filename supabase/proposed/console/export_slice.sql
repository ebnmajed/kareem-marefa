-- console · wave 22 (DEC-232 §2.8, REQ-ADM-017, REQ-ADM-023) — `export.created` records the SLICE that left.
--
-- `write_admin_export_audit()` (0058) wrote `{ "export_type": … }` and nothing else, so a 042 selection, a 049 list
-- filtered by company and role, and a 062 log filtered by actor and period were each indistinguishable from the whole
-- file. A bulk read of personal data is audited BECAUSE of what it read; the row now says what that was.
--
-- One trailing, defaulted parameter, `p_detail jsonb` — the filters, or the ids — stored under `after.slice`. The
-- three-argument function is DROPPED in this same file so PostgREST never sees two overloads (0085's lesson); `main`'s
-- code calls it with three named arguments, which resolve to this one with `p_detail` null — the row it writes is
-- byte-identical to 0058's (`{ "export_type": … }`, no `slice` key). Nothing moves in the gap between push and merge.
--
-- `assert_fresh_admin()` stays the boundary; `p_detail` is the caller's description of its own read, capped so a row
-- cannot carry a payload: 16 KB of JSON (042's 200 ids fit), an object. Grants as 0058.
--
-- 03 §8.2 rows: POL-write_admin_export_audit.slice — an admin's export records its slice under `after.slice`; a call
-- without one writes 0058's row exactly; a non-object or an oversized slice is refused with 22023.

drop function if exists public.write_admin_export_audit(text, text, uuid);

create function public.write_admin_export_audit(
  p_export_type  text,
  p_subject_type text default null,
  p_subject_id   uuid default null,
  p_detail       jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_fresh_admin();
  v_after jsonb := jsonb_build_object('export_type', p_export_type);
begin
  if p_detail is not null then
    if jsonb_typeof(p_detail) <> 'object' or octet_length(p_detail::text) > 16384 then
      raise exception 'export_slice_invalid' using errcode = '22023';
    end if;
    v_after := v_after || jsonb_build_object('slice', p_detail);
  end if;
  return public.write_audit(actor.org_id, 'export.created', p_subject_type, p_subject_id,
                            null, v_after, null, 'admin', actor.id);
end $$;
revoke execute on function public.write_admin_export_audit from public, anon;
grant  execute on function public.write_admin_export_audit to authenticated;
