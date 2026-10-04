-- content · wave 26, PR D — an attendee's video: begun by the member, finished or failed by the worker (REQ-STO-011,
-- REQ-STO-016, DEC-248 §6, DEC-251 §5).
--
-- Serves:  01 §25 REQ-STO-011 · REQ-STO-012 · REQ-STO-016
-- Cites:   0025 (enqueue_job — the only door to the queue) · 0001 (story_capture_open) · 0198 (story_frames, the
--          `story-media` bucket) · notes/content.md W26 §5
--
-- ★ THE FRAME IS THE VIDEO'S ONLY ROW. A video earns nothing and never enters the album (REQ-STO-012): no `photos` row,
-- no ledger row, here or anywhere downstream. The frame is born `processing`, readable by its author alone (0198's
-- member predicate), becomes `visible` when the worker has written the stripped rendition — and only then does its 24
-- hours start (`triggered_at = now()`) — or `failed`, which its author reads as «تعذّر» and nobody else sees at all.
--
-- ★ `ffprobe`, never the client, decides the 15-second and 60 MB limits; the declared size here is a courtesy refusal
-- before the job, and the bucket's own `file_size_limit` refuses the PUT at the edge.
--
-- 03 §8.2:
--   | `RPC-begin_story_video` | checked in, inside the window ✓ (one `processing` frame, one `transcode_story_video` job keyed `story_video:{frame}` on the `story_video` queue) · outside the gate → 42501 · a path not this frame's → 22023 · over 60 MB declared → 23514 · the same frame twice → one frame, one job |
--   | `RPC-record_story_video` | service_role only · processing → visible, triggered_at now, source_path null · any other state → no-op |
--   | `RPC-fail_story_video`   | service_role only · processing → failed with its reason · any other state → no-op |

-- ─── 1 · begin_story_video() — the member's call, after the PUT ─────────────────────────────────────────────────
create function public.begin_story_video(
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
  if p_declared_byte_size is null or p_declared_byte_size <= 0 or p_declared_byte_size > 62914560 then
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

-- ─── 2 · record_story_video() — the worker, once the stripped rendition and its poster exist ──────────────────
create function public.record_story_video(
  p_frame_id    uuid,
  p_video_path  text,
  p_poster_path text,
  p_duration_ms int,
  p_width       int,
  p_height      int,
  p_byte_size   bigint,
  p_sha256      text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update public.story_frames
     set state = 'visible', triggered_at = now(), source_path = null,
         video_path = p_video_path, poster_path = p_poster_path, duration_ms = p_duration_ms,
         width = p_width, height = p_height, byte_size = p_byte_size, sha256 = p_sha256
   where id = p_frame_id and kind = 'video' and state = 'processing';
  get diagnostics n = row_count;
  return jsonb_build_object('status', case when n = 1 then 'ok' else 'noop' end);
end $$;
revoke all on function public.record_story_video(uuid, text, text, int, int, int, bigint, text) from public, anon, authenticated;
grant execute on function public.record_story_video(uuid, text, text, int, int, int, bigint, text) to service_role;

-- ─── 3 · fail_story_video() — the worker, when ffprobe refuses or ffmpeg fails ──────────────────────────────────
create function public.fail_story_video(p_frame_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update public.story_frames
     set state = 'failed', source_path = null,
         failure_reason = case when p_reason in ('too_long', 'too_large', 'unsupported') then p_reason else 'failed' end
   where id = p_frame_id and kind = 'video' and state = 'processing';
  get diagnostics n = row_count;
  return jsonb_build_object('status', case when n = 1 then 'ok' else 'noop' end);
end $$;
revoke all on function public.fail_story_video(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_story_video(uuid, text) to service_role;
