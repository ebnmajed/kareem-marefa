-- Launch, pre-launch fix (DEC-058) — uploads are PDF-only.
--
-- The owner's decision for Launch: no PowerPoint, no Keynote. The converter
-- (DEC-032, LibreOffice + poppler behind signed URLs) is removed from the
-- repository; the PDF page images are rendered by poppler inside the worker
-- image. This migration makes the database say the same thing the upload
-- form, the DAL and the worker now say, so no row can carry a kind nothing
-- will ever render.
--
-- `material_kind` keeps its `powerpoint` and `keynote` values: a Postgres
-- enum value cannot be dropped, and migrations are forward-only (CLAUDE.md
-- invariant 3). A CHECK is the forward-only way to retire them. It is added
-- NOT VALID and then validated separately — the validation scans the table
-- without an ACCESS EXCLUSIVE lock, and on production (which has never held
-- a materials row) it is instant either way.
--
-- Serves:  REQ-MAT-002 (as amended by DEC-058), REQ-MAT-003, REQ-MAT-011
-- Cites:   0037 (materials), 0046 / 0053 (finalize_material_upload,
--          carry_over_proposal_materials), 0048 (record_material_conversion),
--          11 §2.4 (JOB-convert_document)
--
-- 03 §8.2 rows this changes / adds:
--   | `RPC-finalize_material_upload.enqueues` | A `pdf` material enqueues
--     `convert_document` keyed `conv:{version_id}`; an `image`/`audio`
--     material does not, and its `render_status` is `not_applicable`. |
--   | `POL-materials.kind_pdf_only` | An insert with kind `powerpoint` or
--     `keynote` is refused `23514` by `materials_kind_pdf_only`, for every
--     role including the owner (DEC-058). |

alter table public.materials
  add constraint materials_kind_pdf_only
  check (kind not in ('powerpoint', 'keynote')) not valid;
alter table public.materials validate constraint materials_kind_pdf_only;

-- finalize_material_upload (0046, amended 0053): `pdf` alone is `pending`
-- and enqueued. Body otherwise verbatim from 0053; `create or replace` keeps
-- the existing grants.
create or replace function public.finalize_material_upload(
  p_material_id  uuid,
  p_storage_path text,
  p_byte_size    bigint,
  p_sniffed_mime text,
  p_sha256       text
) returns public.material_versions
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id       uuid;
  v_session_id   uuid;
  v_proposal_id  uuid;
  v_kind         public.material_kind;
  v_is_admin     boolean := public.is_org_admin();
  v_next_version int;
  v_limit_mb     int;
  v_render       public.render_status;
  v_version      public.material_versions;
begin
  select m.org_id, m.session_id, m.proposal_id, m.kind into v_org_id, v_session_id, v_proposal_id, v_kind
    from public.materials m
   where m.id = p_material_id;
  if v_org_id is null or v_org_id is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (v_is_admin
          or (v_session_id is not null and public.is_presenter_of(v_session_id))
          or (v_proposal_id is not null and public.is_proposal_owner_of(v_proposal_id))) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

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

  -- DEC-058: only a PDF is ever rendered; image and audio are not_applicable.
  v_render := case when v_kind = 'pdf' then 'pending' else 'not_applicable' end;

  update public.materials
     set current_version_id = v_version.id, render_status = v_render, updated_at = now()
   where id = p_material_id;

  -- A proposal's own material is never enqueued for rendering while still a
  -- draft — 07 §4.1's pipeline needs a real session_id to build a storage
  -- path from, and this one has none yet. carry_over_proposal_materials()
  -- enqueues it once the proposal becomes a session.
  if v_render = 'pending' and v_session_id is not null then
    perform public.enqueue_job('convert_document', jsonb_build_object('version_id', v_version.id, 'material_id', p_material_id), 'conv:' || v_version.id::text);
  end if;

  return v_version;
end $$;

-- carry_over_proposal_materials (0053): the deferred enqueue, for `pdf` alone.
create or replace function public.carry_over_proposal_materials() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if new.proposal_id is null then
    return new;
  end if;

  for r in
    update public.materials
       set session_id = new.id, proposal_id = null
     where proposal_id = new.proposal_id
    returning id, kind, current_version_id, render_status
  loop
    if r.kind = 'pdf' and r.current_version_id is not null and r.render_status = 'pending' then
      perform public.enqueue_job(
        'convert_document',
        jsonb_build_object('version_id', r.current_version_id, 'material_id', r.id),
        'conv:' || r.current_version_id::text
      );
    end if;
  end loop;

  return new;
end $$;
