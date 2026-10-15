-- 0225 — story media's size ceiling, 60 MB → 50 MB (DEC-293 §3; REQ-STO-011, REQ-STO-016). Promoted from
-- supabase/proposed/content/01_story_media_size.sql.
--
-- Since DEC-293 a story video comes from the phone's own camera app and is TRIMMED to its first 15.0 s by the worker
-- rather than refused, so the upload is whatever the camera wrote. ★ The project is on Supabase's Free plan, whose
-- global upload limit is fixed at 50 MB and caps every bucket — 0198's 60 MB was never reachable. The owner ruled the
-- figure to the plan's: 50 MB (2026-10-15). About 50 s of iPhone 1080p30 HEVC (the default), ≈ 18 s of 4K30.
--
-- Two places hold the figure, both here, in one file so they cannot drift:
--   1. the bucket's `file_size_limit` — Storage refuses a larger PUT itself (the bytes never pass through the app);
--   2. `begin_story_video()`'s declared-size check — the frame is never written for a declared size over it.
-- NOT moved: `story_frames.byte_size` (0198) — the RENDITION's size (≤ 15 s, ≈ 5 MB). `allowed_mime_types` unchanged.
--
-- Forward-only: `main`'s app declares up to 60 MB, but the plan's global limit already refuses anything over 50 MB at
-- the PUT, so `begin_story_video()` refusing 50 – 60 MB admits nothing less than production does today.

update storage.buckets set file_size_limit = 52428800 where id = 'story-media';

-- begin_story_video() — 0199's, verbatim but for the ceiling (62914560 → 52428800).
create or replace function public.begin_story_video(
  p_frame_id           uuid,
  p_session_id         uuid,
  p_storage_path       text,
  p_declared_byte_size bigint,
  p_caption            text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id  uuid := public.auth_org_id();
  v_member  uuid := public.auth_member_id();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_prefix  text := v_org_id::text || '/sessions/' || p_session_id::text || '/frames/' || p_frame_id::text || '/source.';
  v_new     uuid;
begin
  if not public.story_capture_open(p_session_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- Re-derived, never trusted: `storyVideoSourcePath()`'s shape for THIS org, session and frame, one of three extensions.
  if p_storage_path is null or left(p_storage_path, char_length(v_prefix)) <> v_prefix
     or substr(p_storage_path, char_length(v_prefix) + 1) not in ('mp4', 'mov', 'webm') then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  if p_declared_byte_size is null or p_declared_byte_size <= 0 or p_declared_byte_size > 52428800 then
    raise exception 'file_too_large' using errcode = '23514';
  end if;
  if v_caption is not null and char_length(v_caption) > 100 then
    raise exception 'caption_too_long' using errcode = '22001';
  end if;

  insert into public.story_frames
    (id, org_id, session_id, kind, trigger_key, triggered_at, author_id, caption, state, source_path)
  values
    (p_frame_id, v_org_id, p_session_id, 'video', p_frame_id::text, now(), v_member, v_caption, 'processing', p_storage_path)
  on conflict do nothing
  returning id into v_new;

  if v_new is null then
    -- A retried complete: the frame exists. Its job was enqueued with it; nothing more to do.
    return jsonb_build_object('status', 'processing', 'frame_id', p_frame_id);
  end if;

  perform public.enqueue_job(
    'transcode_story_video',
    jsonb_build_object('frame_id', p_frame_id, 'org_id', v_org_id, 'session_id', p_session_id, 'source_path', p_storage_path),
    'story_video:' || p_frame_id::text,
    null,
    'story_video',  -- one transcode at a time on the worker
    3
  );
  return jsonb_build_object('status', 'processing', 'frame_id', p_frame_id);
end $$;
revoke all on function public.begin_story_video(uuid, uuid, text, bigint, text) from public, anon;
grant execute on function public.begin_story_video(uuid, uuid, text, bigint, text) to authenticated;
