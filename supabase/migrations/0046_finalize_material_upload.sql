-- promoted by the lead at wave-2 sync 8 · content, follow-up — the one door that turns a completed Storage upload
-- into a usable material version. STORY-MAT-001, 07-content-pipeline.md §1.
--
-- Why an RPC and not a plain client INSERT + UPDATE: `material_versions`
-- insert is already RLS-reachable directly (materials_version_insert, 0037),
-- but `materials.current_version_id` and `.render_status` are NOT in the
-- client's column grant (0037 grants only title/phase/allow_download) —
-- those two are the render pipeline's own state, not something a presenter
-- edits by hand. Two separate statements would also let a version exist
-- with no current_version_id pointing at it (or the reverse) if the second
-- one failed; one function makes it atomic. SECURITY DEFINER only for the
-- second half (the materials update + the enqueue, which needs
-- public.enqueue_job — DEFINER-only, 0025) — authority is re-derived from
-- the caller's own claims first, exactly like remove_material().
--
-- The route handler (api/upload/material/complete) has already sniffed the
-- uploaded bytes and computed sha256/byte_size — this function does not
-- reach into Storage itself, so it takes those as arguments rather than
-- re-deriving them, and re-validates the size against the org's own limit
-- for the material's kind (REQ-MAT-009: the server-side check is the
-- control, not the client's declared size at initiate).
--
-- Serves:  REQ-MAT-001, REQ-MAT-002, REQ-MAT-003, REQ-MAT-009, REQ-MAT-012
-- Cites:   0025 (public.enqueue_job) · 0037 (materials, material_versions,
--          materials_version_insert) · 11 §2.4 (JOB-convert_document,
--          key conv:{version_id})
--
-- 03 §8.2 rows this adds:
--   | `RPC-finalize_material_upload.authority` | A member who is neither
--     the session's presenter nor an org admin is refused `42501`. |
--   | `RPC-finalize_material_upload.size` | A byte size over the org's
--     `limit_document_mb`/`limit_audio_mb`/`limit_image_mb` for the
--     material's kind is refused `23514`, naming the limit. |
--   | `RPC-finalize_material_upload.enqueues` | A `pdf`/`powerpoint`
--     material enqueues `convert_document` keyed `conv:{version_id}`; an
--     `image`/`audio`/`keynote` material does not, and its `render_status`
--     is `not_applicable`. |
--   | `RPC-finalize_material_upload.version_number` | A second call for the
--     same material inserts version 2 and moves `current_version_id`,
--     leaving version 1's row and its pages untouched (`REQ-MAT-010`). |
create function public.finalize_material_upload(
  p_material_id  uuid,
  p_storage_path text,
  p_byte_size    bigint,
  p_sniffed_mime text,
  p_sha256       text
) returns public.material_versions
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id      uuid;
  v_session_id  uuid;
  v_kind        public.material_kind;
  v_is_admin    boolean := public.is_org_admin();
  v_next_version int;
  v_limit_mb    int;
  v_render      public.render_status;
  v_version     public.material_versions;
begin
  select m.org_id, m.session_id, m.kind into v_org_id, v_session_id, v_kind
    from public.materials m
   where m.id = p_material_id;
  if v_org_id is null or v_org_id is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (v_is_admin or public.is_presenter_of(v_session_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- REQ-MAT-009: the server-side check is the control. The org's own limits,
  -- by kind category — documents (pdf/powerpoint/keynote), audio, image.
  select case v_kind
           when 'audio' then limit_audio_mb
           when 'image' then limit_image_mb
           else limit_document_mb
         end
    into v_limit_mb
    from public.org_settings where org_id = v_org_id;
  if p_byte_size > v_limit_mb::bigint * 1024 * 1024 then
    raise exception 'file_too_large: byte_size % exceeds the % MB limit for kind %', p_byte_size, v_limit_mb, v_kind
      using errcode = '23514';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
    from public.material_versions where material_id = p_material_id;

  insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
  values (v_org_id, p_material_id, v_next_version, p_storage_path, p_byte_size, p_sniffed_mime, p_sha256, public.auth_member_id())
  returning * into v_version;

  -- Only pdf/powerpoint are ever converted (DEC-006, 07 §4.1); everything
  -- else — keynote, image, audio — is not_applicable and enqueues nothing.
  v_render := case when v_kind in ('pdf', 'powerpoint') then 'pending' else 'not_applicable' end;

  update public.materials
     set current_version_id = v_version.id, render_status = v_render, updated_at = now()
   where id = p_material_id;

  if v_render = 'pending' then
    perform public.enqueue_job('convert_document', jsonb_build_object('version_id', v_version.id, 'material_id', p_material_id), 'conv:' || v_version.id::text);
  end if;

  return v_version;
end $$;
revoke all on function public.finalize_material_upload(uuid, text, bigint, text, text) from public, anon;
grant execute on function public.finalize_material_upload(uuid, text, bigint, text, text) to authenticated;
