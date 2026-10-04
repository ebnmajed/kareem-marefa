-- content · wave 26, PR D — an attendee's story photograph is an album photograph, with a caption (REQ-STO-011,
-- REQ-STO-012, REQ-STO-013, DEC-251 §4.2).
--
-- Serves:  01 §25 REQ-STO-011 … 013 · REQ-EVT-010 · REQ-EVT-011
-- Cites:   0115 (record_photo_upload, initiate_photo_processing — the shapes copied) · 0174 (record_photo_upload is the
--          ONLY writer of photos) · 0178 (the award follows the insert) · 0001 (story_capture_open) ·
--          notes/content.md W26 §4
--
-- ★ THE ALBUM'S OWN PATH, ONE DOOR NARROWER. The bytes are PUT under `photos_storage_write` exactly as an album upload's
-- are; the worker strips them, `record_photo_upload()` writes the row, `0178` pays the album's award under the album's
-- cap, and `sessions'` hook writes the `photo` frame (DEC-251 §4.1). The story path adds two things only: the capture
-- gate, and the caption. A refused call leaves an object nobody can read — no row exists for it (`0156:68-78`) — the
-- same as any PUT that was never completed.
--
-- ★ THE CAPTION LIVES ON THE PHOTOGRAPH (`photos.caption`, 0198) and the frame reads it through its join, copying
-- nothing (DEC-248 §5). It travels in the job's payload, so it survives the queue; `main`'s OLD worker ignores the key
-- and calls the 10-argument form, so in the gap the photo posts uncaptioned and nothing breaks.

-- ─── 1 · initiate_story_photo() — the capture gate, then the album's own job ─────────────────────────────────────
-- 03 §8.2:
--   | `RPC-initiate_story_photo` | checked in, inside the window ✓ (one `process_photo` job, its caption in the payload) · outside the gate → 42501, no job · over the org's image limit → 23514 · caption over 100 → 22001 |
create function public.initiate_story_photo(
  p_photo_id           uuid,
  p_session_id         uuid,
  p_storage_path       text,
  p_declared_kind      text,
  p_declared_byte_size bigint,
  p_caption            text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id   uuid := public.auth_org_id();
  v_member   uuid := public.auth_member_id();
  v_limit_mb int;
  v_caption  text := nullif(btrim(coalesce(p_caption, '')), '');
begin
  if not public.story_capture_open(p_session_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_declared_kind is null or p_declared_kind not in ('jpeg', 'png', 'webp') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  -- The path is re-derived, never trusted: the album's shape for THIS org, session and photo id.
  if p_storage_path is distinct from
     (v_org_id::text || '/sessions/' || p_session_id::text || '/photos/' || p_photo_id::text || '.'
      || case p_declared_kind when 'jpeg' then 'jpg' else p_declared_kind end) then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  if v_caption is not null and char_length(v_caption) > 100 then
    raise exception 'caption_too_long' using errcode = '22001';
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
      'uploader_id', v_member, 'storage_path', p_storage_path, 'declared_kind', p_declared_kind,
      'uploaded_at', now(), 'caption', v_caption
    ),
    'photo:' || p_photo_id::text
  );
end $$;
revoke all on function public.initiate_story_photo(uuid, uuid, text, text, bigint, text) from public, anon;
grant execute on function public.initiate_story_photo(uuid, uuid, text, text, bigint, text) to authenticated;

-- ─── 2 · record_photo_upload() — two trailing defaulted arguments ───────────────────────────────────────────────
-- Dropped and re-created IN THIS FILE so PostgREST never sees two overloads (0085's lesson). Every earlier caller —
-- `main`'s worker sends ten positional arguments — keeps working: `p_caption` defaults to null and
-- `p_story_derivative` to false, which is exactly today's row. The body below the new columns is 0115's, unchanged.
-- 03 §8.2:
--   | `RPC-record_photo_upload.caption` | a caption is stored on the row; ten arguments still record a photo with none |
--   | `RPC-record_photo_upload.story`   | `story_derivative_ready` follows the worker's word; default false |
drop function public.record_photo_upload(uuid, uuid, uuid, uuid, text, bigint, text, int, int, timestamptz);

create function public.record_photo_upload(
  p_photo_id         uuid,
  p_org_id           uuid,
  p_session_id       uuid,
  p_uploader_id      uuid,
  p_storage_path     text,
  p_byte_size        bigint,
  p_sha256           text,
  p_width            int default null,
  p_height           int default null,
  p_uploaded_at      timestamptz default now(),
  p_caption          text default null,
  p_story_derivative boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit_mb  int;
  v_row       public.photos;
  v_day_count int;
  v_day_id    uuid;
  v_caption   text := nullif(btrim(coalesce(p_caption, '')), '');
begin
  select limit_image_mb into v_limit_mb from public.org_settings where org_id = p_org_id;
  if v_limit_mb is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_byte_size > v_limit_mb::bigint * 1024 * 1024 then
    return jsonb_build_object('status', 'file_too_large', 'limit_mb', v_limit_mb);
  end if;

  select count(*) into v_day_count from public.session_days where session_id = p_session_id;
  if v_day_count > 1 then
    v_day_id := public.resolve_photo_day(p_session_id, p_uploaded_at);
  end if;

  insert into public.photos
    (id, org_id, session_id, session_day_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped,
     caption, story_derivative_ready)
  values
    (p_photo_id, p_org_id, p_session_id, v_day_id, p_uploader_id, p_storage_path, p_width, p_height, p_byte_size, p_sha256, true,
     left(v_caption, 100), coalesce(p_story_derivative, false))
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.photos where id = p_photo_id;
  end if;

  return jsonb_build_object('status', 'ok', 'photo', to_jsonb(v_row));
end $$;
revoke all on function public.record_photo_upload(uuid, uuid, uuid, uuid, text, bigint, text, int, int, timestamptz, text, boolean) from public, anon, authenticated;
grant execute on function public.record_photo_upload(uuid, uuid, uuid, uuid, text, bigint, text, int, int, timestamptz, text, boolean) to service_role;
