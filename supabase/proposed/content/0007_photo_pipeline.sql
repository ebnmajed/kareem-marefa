-- content, follow-up — the photo upload pipeline: STORY-EVT-005/006,
-- REQ-EVT-009 … REQ-EVT-011, 07 §9.
--
-- `photos` carries `check (exif_stripped)` (0037) — a row cannot exist for
-- an unstripped image, and REQ-EVT-011 forbids stripping as "a later
-- cleanup job." For materials, finalize_material_upload() runs on Vercel,
-- in the Route Handler's own request, because the app can read the raw
-- uploaded bytes straight back through its own RLS-bound client. It cannot
-- do that here: `photos_storage_read` denies everyone — including the
-- uploader — until a matching `photos` row exists (0037; proven by
-- tests/rls/storage-content.test.ts's own "no RETURNING here" case), so
-- there is no RLS-bound way to read the pre-strip object at all. Reading it
-- needs `service_role`, and CLAUDE.md invariant 7 keeps that off Vercel
-- entirely — so the strip has to run in the worker, which is the one
-- process allowed to hold it (DEC-047).
--
-- Two doors, mirroring finalize_material_upload/record_material_conversion's
-- own split between "the authenticated call that starts the pipeline" and
-- "the service_role call that finishes it":
--
--   initiate_photo_processing() — authenticated. Called right after the
--     browser's own direct PUT to the `photos` bucket succeeds (07 §1 —
--     bytes never traverse Vercel for photos either). `photos_storage_
--     write` (0037) already gated that PUT on has_checked_in() /
--     is_presenter_of() / is_staff() for this exact session; this
--     re-derives the same three-way test as a second, independent check —
--     the same shape finalize_material_upload uses, and the only place a
--     JWT-backed auth_member_id()/auth_org_id() is available at all, since
--     the worker's raw `pg` connection (no PostgREST request) has neither.
--     Enqueues `process_photo` keyed `photo:{photo_id}`.
--   record_photo_upload() — service_role-only. Called by the worker once it
--     has read the raw object, sniffed it, stripped it byte-level, and
--     written the stripped bytes back to the SAME path. DEC-043's envelope
--     shape: the strip and the re-upload already happened (an external
--     Storage side effect this transaction cannot undo), so a real-size
--     violation is a decision, not a precondition failure, and comes back
--     as `{status: 'file_too_large', limit_mb}` rather than a raised
--     exception — "the M5 upload finaliser" DEC-043 names by name.
--     `on conflict (id) do nothing` makes a job retry after a crash between
--     this call and the job's own completion safe: it returns the
--     already-inserted row rather than erroring.
--
-- Serves:  REQ-EVT-009, REQ-EVT-010, REQ-EVT-011, 11 §2.4 (JOB-process_photo)
-- Cites:   0025 (public.enqueue_job) · 0037 (photos, photos_insert_checked_in,
--          photos_storage_write, photos_storage_read) · DEC-043 (envelope) ·
--          DEC-047 (byte-level strip, in the worker)
--
-- 03 §8.2 rows this adds:
--   | `RPC-initiate_photo_processing.authority` | A member with a confirmed
--     RSVP and no check-in, who is not the session's presenter or org
--     staff, is refused `42501` — REQ-EVT-009, mirroring
--     `photos_storage_write`. |
--   | `RPC-initiate_photo_processing.size` | A declared byte size over the
--     org's `limit_image_mb` is refused `23514`, naming the limit — the
--     courtesy check; `record_photo_upload`'s is the control, against the
--     REAL (post-strip) size. |
--   | `RPC-initiate_photo_processing.enqueues` | A successful call enqueues
--     `process_photo` keyed `photo:{photo_id}`. |
--   | `RPC-record_photo_upload.service_role_only` | `authenticated` and
--     `anon` are both refused on the grant; `service_role` succeeds. |
--   | `RPC-record_photo_upload.exif_stripped` | Every row this function
--     inserts has `exif_stripped = true` — it is the ONLY door that can
--     ever create a `photos` row (03 §5.6c's `with check (exif_stripped)`
--     says the same thing again, as a constraint rather than a door). |
--   | `RPC-record_photo_upload.size_envelope` | A real byte size over the
--     org's `limit_image_mb` returns `{status: 'file_too_large', limit_mb}`
--     and inserts no row, rather than raising (DEC-043). |
--   | `RPC-record_photo_upload.idempotent` | A second call with the same
--     `p_photo_id` (a retried job) returns the already-inserted row's
--     envelope rather than erroring on the primary key. |
create function public.initiate_photo_processing(
  p_photo_id           uuid,
  p_session_id         uuid,
  p_storage_path       text,
  p_declared_kind      text,
  p_declared_byte_size bigint
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id   uuid := public.auth_org_id();
  v_member   uuid := public.auth_member_id();
  v_limit_mb int;
begin
  if not (public.has_checked_in(p_session_id) or public.is_presenter_of(p_session_id) or public.is_staff()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select limit_image_mb into v_limit_mb from public.org_settings where org_id = v_org_id;
  if v_limit_mb is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_declared_byte_size > v_limit_mb::bigint * 1024 * 1024 then
    raise exception 'file_too_large: byte_size % exceeds the % MB limit', p_declared_byte_size, v_limit_mb
      using errcode = '23514';
  end if;

  perform public.enqueue_job(
    'process_photo',
    jsonb_build_object(
      'photo_id', p_photo_id, 'org_id', v_org_id, 'session_id', p_session_id,
      'uploader_id', v_member, 'storage_path', p_storage_path, 'declared_kind', p_declared_kind
    ),
    'photo:' || p_photo_id::text
  );
end $$;
revoke all on function public.initiate_photo_processing(uuid, uuid, text, text, bigint) from public, anon;
grant execute on function public.initiate_photo_processing(uuid, uuid, text, text, bigint) to authenticated;

create function public.record_photo_upload(
  p_photo_id     uuid,
  p_org_id       uuid,
  p_session_id   uuid,
  p_uploader_id  uuid,
  p_storage_path text,
  p_byte_size    bigint,
  p_sha256       text,
  p_width        int default null,
  p_height       int default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit_mb int;
  v_row      public.photos;
begin
  select limit_image_mb into v_limit_mb from public.org_settings where org_id = p_org_id;
  if v_limit_mb is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- DEC-043: the strip and the re-upload already happened outside this
  -- transaction — refusing here is a decision the worker acts on
  -- (deletes the object), never a raised exception unwinding a write that
  -- was never made in the first place (there is nothing to unwind: this
  -- function has not written anything yet at this point).
  if p_byte_size > v_limit_mb::bigint * 1024 * 1024 then
    return jsonb_build_object('status', 'file_too_large', 'limit_mb', v_limit_mb);
  end if;

  insert into public.photos (id, org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped)
  values (p_photo_id, p_org_id, p_session_id, p_uploader_id, p_storage_path, p_width, p_height, p_byte_size, p_sha256, true)
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.photos where id = p_photo_id;
  end if;

  return jsonb_build_object('status', 'ok', 'photo', to_jsonb(v_row));
end $$;
revoke all on function public.record_photo_upload(uuid, uuid, uuid, uuid, text, bigint, text, int, int) from public, anon, authenticated;
grant execute on function public.record_photo_upload(uuid, uuid, uuid, uuid, text, bigint, text, int, int) to service_role;
