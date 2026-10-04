-- 0199 · wave 26 (DEC-248, DEC-251; REQ-STO-001 … 018) — session stories: the behaviour, promoted.
--
-- 0198 is the storage. This is everything that writes to it and reads from it,
-- promoted from the two tracks' proposed files exactly as they proved them
-- (`tests/rls/story-generator.test.ts`, 17 cases; `tests/rls/story-frames-content.test.ts`,
-- 16 cases), in dependency order, with the four things only the lead adds:
--
--   A. the `story-media` WRITE policy — it calls `content`'s capture gate, so it
--      could not be in 0198;
--   B. the three triggers that attach `content`'s trigger functions;
--   C. nothing of its own any more: `content`'s definers call 0198's
--      `story_frame_is_visible()` directly, so the rule has one definition;
--   D. a guard in `resolve_report()` (0183): a story frame's report must never
--      reach `remove_photo()`, which that function calls for every target that
--      is not a comment.
--
-- ★ Additive for `main`, which runs on this schema before the new code deploys:
--   · the three generator triggers fire on writes `main` already makes — a
--     publish, the clock's start and completion, a recorded photograph, a
--     finalised material — and write frame rows nobody on `main` reads. The
--     generator has no raising path, so none of those writes can be refused;
--   · `record_photo_upload()` is dropped and re-created with two TRAILING
--     DEFAULTED arguments, so `main`'s worker, calling it with ten, still
--     resolves it (0085's lesson: one overload, never two);
--   · `main`'s worker has no `generate_story_frames`, `transcode_story_video` or
--     `purge_story_video` task: the clock-driven frames wait for the new worker
--     (whose 24-hour look-back then writes those still current, at their own
--     instants), and a queued transcode waits in its queue;
--   · `resolve_report()`'s new branch is unreachable on `main`: nothing there
--     can file a story-frame report.
--
--   | `POL-story_media_write` | a checked-in attendee inside the window uploads a source under their org and that session ✓ · not checked in ✗ · outside the window ✗ · another org's prefix ✗ · any name but source.(mp4|mov|webm) ✗ · no update, so no overwrite |
--   | `RPC-resolve_report.story_frame` | a story-frame report: `invalid`, nothing written |
--   The tracks' own rows are in 03 §8.2 (`TRG-story.*`, `RPC-story*`, and content's).

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══ content · 0001_story_capture_gate.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- content · wave 26, PR D — the capture gate (REQ-STO-011, DEC-248 §5, DEC-251 §5).
--
-- Serves:  01 §25 REQ-STO-011 · REQ-STO-012 · REQ-STO-016
-- Cites:   0087 (has_checked_in(), a removed check-in no longer counts) · 0100 (session_days) · notes/content.md W26 §4.1
--
-- ★ «أضف» exists only for a member checked in to the session, from its start until 24 hours after its end — and THE
-- SERVER REFUSES EVERYONE ELSE whatever the screen shows. This is that server: one predicate, called by
-- `initiate_story_photo()`, `begin_story_video()`, the `story-media` bucket's write policy (0198, the lead's) and the
-- DAL's `canAdd` hint. ★ It must exist BEFORE 0198's storage policy is created, which names it.
--
--   · checked in — `has_checked_in()`, so a removed check-in (0087) does not count, and a presenter or staff member who
--     did not check in is refused (REQ-STO-011 says «a member checked in», nothing wider);
--   · the session is not cancelled;
--   · now() is at or after the FIRST day's start and before the LAST day's end + 24 hours (a multi-day session's window
--     is the whole run, REQ-SES-015).
--
-- `security definer` because `session_days` and `sessions` are read whatever the caller's RLS shows; the answer is a
-- boolean about the caller alone (`has_checked_in()` reads `auth_member_id()`), so nothing leaks. `stable`: one
-- statement sees one clock.
--
-- 03 §8.2 rows this adds (tests/rls/story-frames-content.test.ts):
--   | `RPC-story_capture_open` | checked in, inside the window ✓ · not checked in ✗ · check-in removed ✗ · presenter not checked in ✗ · staff not checked in ✗ · before the start ✗ · at end + 24 h ✗ · cancelled ✗ · another org's session ✗ |
create function public.story_capture_open(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.has_checked_in(s.id)
           and s.state <> 'cancelled'
           and now() >= min(d.starts_at)
           and now() <  max(d.ends_at) + interval '24 hours'
      from public.sessions s
      join public.session_days d on d.session_id = s.id
     where s.id = p_session
       and s.org_id = public.auth_org_id()
     group by s.id, s.state
  ), false)
$$;
revoke all on function public.story_capture_open(uuid) from public, anon;
grant execute on function public.story_capture_open(uuid) to authenticated;


-- ═══ A · the story-media write policy (the lead) ═══════════════════════════════════════════════════════════════
-- Insert only, and only a SOURCE: under the caller's org, under a session whose capture window is open for the
-- caller (`story_capture_open()` — checked in, from the start until 24 hours after the end, not cancelled), in a
-- frame's folder. No update policy exists, so an object can never be overwritten; the rendition and the poster are
-- written by the worker. The session segment is cast only once it has the shape of a uuid — a cast on anything else
-- would raise instead of refusing.
create policy "story_media_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'story-media'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (storage.foldername(name))[2] = 'sessions'
    and (storage.foldername(name))[4] = 'frames'
    and (storage.foldername(name))[5] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and storage.filename(name) ~ '^source\.(mp4|mov|webm)$'
    -- ★ A CASE, not two terms of the AND: Postgres does not promise to evaluate AND left to right, so a regex beside
    -- a cast could let the planner run the cast first and RAISE on a name that is not a uuid instead of refusing it.
    -- Only CASE fixes the order (`content`, at promotion).
    and coalesce(public.story_capture_open(
          case when (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then ((storage.foldername(name))[3])::uuid end), false)
  );
grant insert on storage.objects to authenticated;   -- stated, not assumed (invariant 6)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══ content · 0002_story_photo.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══ content · 0003_story_video.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══ content · 0004_story_moderation.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- content · wave 26, PR D — a frame is reported, taken down, decided and removed (REQ-STO-014, REQ-STO-015,
-- REQ-STO-017, DEC-251 §4.8 – §4.9).
--
-- Serves:  01 §25 REQ-STO-014 · REQ-STO-015 · REQ-STO-017 · REQ-EVT-008 · REQ-EVT-012 · REQ-EVT-014 · REQ-PTS-013 ·
--          REQ-ADM-010 · REQ-ADM-018
-- Cites:   0037 (photo_takedowns) · 0059 (remove_photo, photo.removed, the photo_removed reversal) · 0181
--          (report.resolved) · 0190 (report_photo — the shape copied) · 0198 (story_frames, story_frame_takedowns,
--          reports.story_frame_id) · notes/content.md W26 §6 – §7
--
-- ★ THE RULINGS (DEC-251 §4.8 – §4.9). One report hides the FRAME; a photo frame's photograph stays in the album
-- (REQ-EVT-008 governs the album, and hiding the photograph would reverse its points on one member's word). «أزلني» on a
-- photo frame is the photograph's OWN takedown (the existing `photo_takedowns` insert — not here); on a video frame it is
-- `request_story_frame_takedown()` below. A removal REQUEST is not audited — its row is the record, as a photograph's
-- is; a DECISION is (`report.resolved` by 0181's trigger, `story_frame.removed` / `story_frame.restored` by this file's
-- trigger function). A hidden video sends no notification (STO §F).
--
-- ★ NO FUNCTION HERE WRITES `audit_log` OR `points_ledger` DIRECTLY. A photo frame's removal is `remove_photo()` (0059),
-- whose own triggers write `photo.removed` and the compensating «حُذف المحتوى» row; a video earned nothing, so its
-- removal reverses nothing.
--
-- ★ AN ENVELOPE, NOT A RAISE (DEC-043): every refusal returns before the first write.

-- ─── 0 · what a member may see of a frame right now ──────────────────────────────────────────────────────────────
-- `public.story_frame_is_visible()` (0198) — ONE predicate for the policy, the feed and these functions, so they cannot
-- drift. ★ It is SECURITY INVOKER, and these functions are definers: inside them its session and photograph sub-reads
-- run as this function's owner, not as the member. That changes nothing it answers — it reads the session's state and
-- the photograph's hidden/removed columns, none of which depends on who asks — and the org is checked here, against
-- the actor's own, before it is called.

-- ─── 1 · report_story_frame() — a member reports an attendee's frame; it hides at once ─────────────────────────
-- { outcome: 'reported' | 'already_reported' | 'own_frame' | 'not_visible' | 'not_reportable' | 'reason_required', report_id? }
-- 03 §8.2:
--   | `RPC-report_story_frame` | a visible attendee frame ✓ (one `story_frame` report; the frame hidden «reported»; a photo frame's photograph untouched, its points untouched) · own ✗ · generated frame ✗ · expired/hidden ✗ · twice ✗ · another org ✗ · reason < 3 ✗ |
create function public.report_story_frame(p_frame uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  f     public.story_frames;
  why   text := btrim(coalesce(p_reason, ''));
  rid   uuid;
begin
  select * into f from public.story_frames where id = p_frame and org_id = actor.org_id for update;
  if not found or not public.story_frame_is_visible(f) then
    return jsonb_build_object('outcome', 'not_visible');
  end if;
  if f.kind not in ('photo', 'video') then
    return jsonb_build_object('outcome', 'not_reportable');   -- a generated frame is the session's own data
  end if;
  if coalesce(f.author_id, (select uploader_id from public.photos where id = f.photo_id)) = actor.id then
    return jsonb_build_object('outcome', 'own_frame');
  end if;
  if char_length(why) < 3 or char_length(why) > 1000 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;
  if exists (select 1 from public.reports where target = 'story_frame' and story_frame_id = p_frame and reporter_id = actor.id) then
    return jsonb_build_object('outcome', 'already_reported');
  end if;

  -- ── nothing above this line writes ─────────────────────────────────────────
  insert into public.reports (org_id, target, story_frame_id, reporter_id, reason)
  values (actor.org_id, 'story_frame', p_frame, actor.id, why)
  returning id into rid;
  update public.story_frames set hidden_at = now(), hidden_reason = 'reported' where id = p_frame and hidden_at is null;
  return jsonb_build_object('outcome', 'reported', 'report_id', rid);
end $$;
revoke execute on function public.report_story_frame(uuid, text) from public, anon;
grant  execute on function public.report_story_frame(uuid, text) to authenticated;

-- The same rules on a direct insert under `reports_insert_self` (0010). The lead attaches it:
--   create trigger reports_story_frame_guard before insert on public.reports
--     for each row when (new.target::text = 'story_frame') execute function public.reports_story_frame_guard();
create function public.reports_story_frame_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f public.story_frames;
begin
  select * into f from public.story_frames where id = new.story_frame_id and org_id = new.org_id;
  if not found or f.kind not in ('photo', 'video') or f.state <> 'visible' or f.removed_at is not null then
    raise exception 'not_visible' using errcode = '23514';
  end if;
  if coalesce(f.author_id, (select uploader_id from public.photos where id = f.photo_id)) = new.reporter_id then
    raise exception 'own_frame' using errcode = '23514';
  end if;
  if exists (select 1 from public.reports where target = 'story_frame' and story_frame_id = new.story_frame_id and reporter_id = new.reporter_id) then
    raise exception 'already_reported' using errcode = '23505';
  end if;
  return new;
end $$;
revoke execute on function public.reports_story_frame_guard() from public, anon, authenticated;

-- ─── 2 · request_story_frame_takedown() — «أزلني» on a VIDEO frame ─────────────────────────────────────────────
-- { outcome: 'hidden' | 'already_requested' | 'not_visible' | 'use_photo_takedown' }
-- 03 §8.2:
--   | `RPC-request_story_frame_takedown` | a visible video frame ✓ (one takedown row; the frame hidden «takedown_requested» for everyone at once; no notification, no audit row) · a photo frame → `use_photo_takedown` (the photograph's own door) · twice → one row |
create function public.request_story_frame_takedown(p_frame uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  f     public.story_frames;
begin
  select * into f from public.story_frames where id = p_frame and org_id = actor.org_id for update;
  if not found or not public.story_frame_is_visible(f) then
    return jsonb_build_object('outcome', 'not_visible');
  end if;
  if f.kind = 'photo' then
    return jsonb_build_object('outcome', 'use_photo_takedown', 'photo_id', f.photo_id);
  end if;
  if f.kind <> 'video' then
    return jsonb_build_object('outcome', 'not_visible');
  end if;
  if exists (select 1 from public.story_frame_takedowns where frame_id = p_frame and requester_id = actor.id and resolved_at is null) then
    return jsonb_build_object('outcome', 'already_requested');
  end if;

  -- ── nothing above this line writes ─────────────────────────────────────────
  insert into public.story_frame_takedowns (org_id, frame_id, requester_id) values (actor.org_id, p_frame, actor.id);
  update public.story_frames set hidden_at = now(), hidden_reason = 'takedown_requested' where id = p_frame and hidden_at is null;
  return jsonb_build_object('outcome', 'hidden');
end $$;
revoke execute on function public.request_story_frame_takedown(uuid) from public, anon;
grant  execute on function public.request_story_frame_takedown(uuid) to authenticated;

-- ─── 3 · remove_story_frame() — staff, from SCR-044's strip or the queue ───────────────────────────────────────
-- { outcome: 'removed' | 'already_removed' | 'not_found' | 'not_authorized' | 'reason_required' | 'not_removable' }
-- 03 §8.2:
--   | `RPC-remove_story_frame` | admin ✓ · moderator ✓ · member ✗ · another org ✗ · no reason ✗ · a photo frame → remove_photo() (photo.removed, one photo_removed row, the frame gone by its join, the album with it) · a video frame → removed_at, its reports and takedowns closed, `story_frame.removed`, a purge enqueued, NO ledger row · twice → already_removed |
create function public.remove_story_frame(p_frame uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  f     public.story_frames;
  why   text := btrim(coalesce(p_reason, ''));
begin
  if actor.org_role not in ('admin', 'moderator') then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  select * into f from public.story_frames where id = p_frame and org_id = actor.org_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if f.kind not in ('photo', 'video') then
    return jsonb_build_object('outcome', 'not_removable');
  end if;
  if f.removed_at is not null
     or (f.kind = 'photo' and exists (select 1 from public.photos where id = f.photo_id and removed_at is not null)) then
    return jsonb_build_object('outcome', 'already_removed');
  end if;
  if char_length(why) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  -- ── nothing above this line writes ─────────────────────────────────────────
  update public.reports
     set status = 'resolved', resolution = 'removed', resolved_by = actor.id, resolved_at = now()
   where org_id = actor.org_id and target = 'story_frame' and story_frame_id = p_frame and status = 'open';

  if f.kind = 'photo' then
    -- The photograph's own removal: photo.removed (0059), the compensating «حُذف المحتوى» row (0059), its takedowns and
    -- photo reports closed. The frame disappears by its join; its objects stay unreadable, as every removed photo's do.
    perform public.remove_photo(f.photo_id, why);
  else
    update public.story_frames
       set removed_at = now(), removed_by = actor.id, removal_reason = left(why, 300),
           hidden_at = coalesce(hidden_at, now()), hidden_reason = coalesce(hidden_reason, 'removed')
     where id = p_frame;
    update public.story_frame_takedowns
       set resolved_at = now(), resolution = 'removed', resolved_by = actor.id
     where frame_id = p_frame and resolved_at is null;
  end if;
  return jsonb_build_object('outcome', 'removed', 'kind', f.kind::text);
end $$;
revoke execute on function public.remove_story_frame(uuid, text) from public, anon;
grant  execute on function public.remove_story_frame(uuid, text) to authenticated;

-- ─── 4 · decide_story_frame() — staff restore or dismiss a hidden frame from the queue ─────────────────────────
-- { outcome: 'restored' | 'dismissed' | 'removed' | 'not_found' | 'not_authorized' | 'reason_required' | 'invalid' | 'already_removed' }
-- 'removed' delegates to remove_story_frame(). 'restored' and 'dismissed' both clear the FRAME's hide (never a
-- photograph's — the photograph's own decisions stay the photo queue's) and close the frame's open reports and
-- takedowns with that resolution; 0181's trigger audits each report's resolution.
-- 03 §8.2:
--   | `RPC-decide_story_frame` | staff ✓ · member ✗ · restored/dismissed → hidden_at cleared, open reports and takedowns closed · removed → remove_story_frame() |
create function public.decide_story_frame(p_frame uuid, p_outcome public.moderation_action, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  f     public.story_frames;
begin
  if actor.org_role not in ('admin', 'moderator') then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  if p_outcome is null then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  if p_outcome = 'removed' then
    return public.remove_story_frame(p_frame, p_reason);
  end if;
  select * into f from public.story_frames where id = p_frame and org_id = actor.org_id for update;
  if not found or f.kind not in ('photo', 'video') then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if f.removed_at is not null then
    return jsonb_build_object('outcome', 'already_removed');
  end if;

  -- ── nothing above this line writes ─────────────────────────────────────────
  update public.reports
     set status = case when p_outcome = 'dismissed' then 'dismissed'::public.report_status else 'resolved'::public.report_status end,
         resolution = p_outcome, resolved_by = actor.id, resolved_at = now()
   where org_id = actor.org_id and target = 'story_frame' and story_frame_id = p_frame and status = 'open';
  update public.story_frame_takedowns
     set resolved_at = now(), resolution = p_outcome, resolved_by = actor.id
   where frame_id = p_frame and resolved_at is null;
  update public.story_frames set hidden_at = null, hidden_reason = null where id = p_frame and hidden_at is not null;
  return jsonb_build_object('outcome', p_outcome::text);
end $$;
revoke execute on function public.decide_story_frame(uuid, public.moderation_action, text) from public, anon;
grant  execute on function public.decide_story_frame(uuid, public.moderation_action, text) to authenticated;

-- ─── 5 · the trigger functions the lead attaches in 0198 ───────────────────────────────────────────────────────
--   create trigger story_frames_audit after update of removed_at, hidden_at on public.story_frames
--     for each row execute function public.story_frames_audit();
--   create trigger story_frames_purge after delete or update of removed_at on public.story_frames
--     for each row execute function public.story_frames_purge();
--
-- story_frame.removed — a staff removal of a video frame (a photo frame's removal is photo.removed, 0059).
-- story_frame.restored — staff clearing a hide (a decision; a hide itself is a request, not audited).
create function public.story_frames_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.removed_at is null and new.removed_at is not null then
    perform public.write_audit(new.org_id, 'story_frame.removed', 'story_frame', new.id, null,
      jsonb_build_object('removed_by', new.removed_by, 'kind', new.kind::text, 'session_id', new.session_id), new.removal_reason);
  elsif old.hidden_at is not null and new.hidden_at is null and new.removed_at is null then
    perform public.write_audit(new.org_id, 'story_frame.restored', 'story_frame', new.id,
      jsonb_build_object('hidden_reason', old.hidden_reason), null);
  end if;
  return null;
end $$;
revoke all on function public.story_frames_audit() from public, anon, authenticated;

-- A video's objects go with its frame — deleted (a session's or org's cascade) or removed by staff. `purge_story_video`
-- deletes everything under the frame's prefix; `delete_org` covers the bucket for an org's deletion as well.
create function public.story_frames_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.story_frames := case when tg_op = 'DELETE' then old else new end;
begin
  if r.kind <> 'video' then
    return null;
  end if;
  if tg_op = 'UPDATE' and not (old.removed_at is null and new.removed_at is not null) then
    return null;
  end if;
  perform public.enqueue_job(
    'purge_story_video',
    jsonb_build_object('frame_id', r.id, 'org_id', r.org_id, 'session_id', r.session_id),
    'story_purge:' || r.id::text
  );
  return null;
end $$;
revoke all on function public.story_frames_purge() from public, anon, authenticated;


-- ═══ B · content's trigger functions, attached (the lead) ══════════════════════════════════════════════════════
create trigger story_frames_audit after update of removed_at, hidden_at on public.story_frames
  for each row execute function public.story_frames_audit();
create trigger story_frames_purge after delete or update of removed_at on public.story_frames
  for each row execute function public.story_frames_purge();
-- `::text`, as 0198's check: the enum's new value is not compared as a literal outside a function body.
create trigger reports_story_frame_guard before insert on public.reports
  for each row when (new.target::text = 'story_frame') execute function public.reports_story_frame_guard();

-- ═══ D · resolve_report() never treats a story frame as a photograph (the lead; 0183's body, one branch added) ═══
create or replace function public.resolve_report(p_report uuid, p_outcome public.moderation_action, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  rep   public.reports;
  why   text := nullif(btrim(coalesce(p_reason, '')), '');
  n     int;
begin
  if actor.org_role not in ('admin', 'moderator') then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  if p_outcome is null or p_outcome not in ('removed', 'dismissed') then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  select * into rep from public.reports where id = p_report and org_id = actor.org_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if rep.status <> 'open' then
    return jsonb_build_object('outcome', 'already_resolved', 'resolution', rep.resolution::text);
  end if;

  -- ★ wave 26 (0199): a report on a STORY FRAME is decided by decide_story_frame() alone. Everything below treats
  -- «not a comment» as «a photograph» — it would call remove_photo(null) — so any other target stops here, before
  -- the first write (DEC-043).
  if rep.target::text not in ('comment', 'photo') then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  if p_outcome = 'removed' then
    -- A reason is owed only for content still visible: an author's own delete needs none and is never re-stamped.
    if (rep.target = 'comment' and exists (select 1 from public.comments where id = rep.comment_id and deleted_at is null))
       or rep.target = 'photo' then
      if why is null or char_length(why) < 3 then
        return jsonb_build_object('outcome', 'reason_required');
      end if;
    end if;
  end if;

  -- Every open report on the same content, counted (and locked) before anything is written.
  select count(*) into n from (
    select 1 from public.reports
     where org_id = actor.org_id and status = 'open' and target = rep.target
       and (case when rep.target = 'comment' then comment_id = rep.comment_id else photo_id = rep.photo_id end)
     for update
  ) open_reports;

  -- ── nothing above this line writes ─────────────────────────────────────────
  if p_outcome = 'removed' then
    if rep.target = 'comment' then
      update public.comments
         set deleted_at = now(), removal_reason = why
       where id = rep.comment_id and deleted_at is null;
    else
      perform public.remove_photo(rep.photo_id, why);   -- also closes the photo's open takedowns and reports
    end if;
  end if;

  update public.reports
     set status = 'resolved', resolution = p_outcome, resolved_by = actor.id, resolved_at = now()
   where org_id = actor.org_id and status = 'open' and target = rep.target
     and (case when rep.target = 'comment' then comment_id = rep.comment_id else photo_id = rep.photo_id end);

  return jsonb_build_object('outcome', p_outcome::text, 'target', rep.target::text, 'resolved', n);
end $$;
revoke execute on function public.resolve_report(uuid, public.moderation_action, text) from public, anon;
grant  execute on function public.resolve_report(uuid, public.moderation_action, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══ sessions · 01_story_generator.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- sessions · wave 26, PR D (DEC-248 §5, DEC-251 §4) — the story generator: one frame per trigger, idempotent by key.
--
-- Serves:  REQ-STO-001 (a story from publication, no author) · REQ-STO-004 (a frame within a minute of each of eight
--          triggers, exactly once however often it fires) · REQ-STO-018 (nothing authored; cancelling ends the story)
-- Cites:   0010:17 (session_state) · 0024:78 (the transition guard — published once) · 0022:40, :67 (the clock) ·
--          0089:57 (transition_session) · 0045:45-60 (reserve_seat: the deadline and the priority window) ·
--          0100 (session_days) · 0115:192 (record_photo_upload, the only photos writer since 0174) · 0037:507
--          (photos_read) · 0178:48-55 (the same `when` on photos) · 0189 (materials_added_notify — its moment,
--          RE-STATED here, never edited) · 0116:70 (materials_read's phase gate) · 0198 (story_frames, the lead's)
--
-- ── One writer, never another track's function ──────────────────────────────────────────────────────────────────────
-- Every frame of a generated kind is written by `generate_story_frame()` and by nothing else. The eight triggers reach
-- it through three TRIGGERS on the tables whose writes they are (sessions, photos, materials) and one minutely CLOCK
-- function for the instants no row write marks. No function another track owns is replaced: the clock's two
-- functions, transition_session(), publish_session()/schedule_session(), record_photo_upload(),
-- materials_added_notify(), finalize_material_upload() and reserve_seat() are untouched — a trigger on their table
-- sees every path they write by.
--
-- ── The idempotency is the lead's constraint ────────────────────────────────────────────────────────────────────────
-- `unique (session_id, kind, trigger_key)` on story_frames (0198). The generator inserts `on conflict do nothing`, so a
-- trigger firing twice, the clock running twice in a minute, or a retried job write one row. Nothing here raises on an
-- expected input: these run INSIDE a publish, a clock move, the photo pipeline's record and a material's finalise,
-- where an exception would refuse the very write the story follows.
--
-- ── Coinciding triggers are one frame (DEC-251 §4.3, REQ-STO-004 amended) ───────────────────────────────────────────
-- With no priority window, «registration opens» IS the publication; with the default deadline, «registration closes»
-- IS the start. So `registration_opened` is written only when a priority window puts it after `published_at`, and
-- `registration_closed` only when the deadline is earlier than the first start.
--
-- ── n days, no branch ───────────────────────────────────────────────────────────────────────────────────────────────
-- `starts_soon` and `live` are per DAY (DEC-251 §4.4) and keyed on the day, so a one-day session's one day is simply
-- its only key. The night between two days is `open` (session-status.ts), so day k ≥ 2's `live` is the clock's.
--
-- Additive for `main`, which runs this schema before its code: the three hooks fire on writes main already makes and
-- write rows main never reads; the clock function is called by nothing until the new worker deploys, and its 24-hour
-- look-back then writes what is still inside its 24 hours, at its scheduled instant, so no expiry moves.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · the one writer
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
create function public.generate_story_frame(
  p_session      uuid,
  p_kind         public.story_frame_kind,
  p_trigger_key  text,
  p_triggered_at timestamptz,
  p_day          uuid default null,
  p_photo        uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid;
  v_state public.session_state;
  v_id    uuid;
begin
  select s.org_id, s.state into v_org, v_state from public.sessions s where s.id = p_session;
  -- A cancelled story has ended (REQ-STO-018); a session before publication has none (REQ-STO-001).
  if v_org is null or v_state not in ('published', 'in_progress', 'completed', 'archived') then
    return null;
  end if;

  insert into public.story_frames (org_id, session_id, session_day_id, kind, trigger_key, triggered_at, photo_id)
  values (v_org, p_session, p_day, p_kind, p_trigger_key, p_triggered_at, p_photo)
  on conflict (session_id, kind, trigger_key) do nothing
  returning id into v_id;
  return v_id;
end $$;
-- No client role, and not the worker either: only the functions below call it, as its owner.
revoke all on function public.generate_story_frame(uuid, public.story_frame_kind, text, timestamptz, uuid, uuid)
  from public, anon, authenticated, service_role;

-- A day's key text: the instant, UTC, to the second — stable across time zones and sessions.
create function public.story_instant_key(p_at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;
revoke all on function public.story_instant_key(timestamptz) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · triggers 1, 5 (the first day) and 7 — the session's own state
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
create function public.sessions_story_frames() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_day uuid;
begin
  if new.state = 'published' and old.state is distinct from 'published' then
    perform public.generate_story_frame(new.id, 'published', 'published', coalesce(new.published_at, now()));

  elsif new.state = 'in_progress' and old.state = 'published' then
    -- The running day, else the first day not yet ended (an admin's early start), else the first.
    select d.id into v_day
      from public.session_days d
     where d.session_id = new.id
     order by (now() >= d.starts_at and now() < d.ends_at) desc, (d.ends_at > now()) desc, d.starts_at, d.id
     limit 1;
    if v_day is not null then
      perform public.generate_story_frame(new.id, 'live', v_day::text, now(), v_day);
    end if;

  elsif new.state = 'completed' and old.state = 'in_progress' then
    -- Not `archived → completed` (a reopen): the recap is written once, by the constant key and by this guard.
    perform public.generate_story_frame(new.id, 'recap', 'completed', coalesce(new.completed_at, now()));
  end if;
  return null;
end $$;
revoke all on function public.sessions_story_frames() from public, anon, authenticated;

-- `after update of state` only: a row INSERTED already published (the RLS fixture) writes nothing, so no existing
-- suite gains a row it did not ask for. Every product path reaches a state by update.
create trigger sessions_story_frames
  after update of state on public.sessions
  for each row
  when (old.state is distinct from new.state and new.state in ('published', 'in_progress', 'completed'))
  execute function public.sessions_story_frames();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · trigger 6 — a photograph becomes visible (DEC-251 §4.1: every visible album photograph, whoever, any door)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- After 0174 the only writer of photos is record_photo_upload(), after the strip, and `check (exif_stripped)` holds on
-- every row — so an insert that is neither hidden nor removed IS the photograph becoming visible (0178's own reading).
-- The frame copies nothing of the photograph: its caption, uploader and visibility are read through `photo_id`.
create function public.photos_story_frame() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.generate_story_frame(new.session_id, 'photo', new.id::text, new.created_at, new.session_day_id, new.id);
  return null;
end $$;
revoke all on function public.photos_story_frame() from public, anon, authenticated;

create trigger photos_story_frame
  after insert on public.photos
  for each row
  when (new.hidden_at is null and new.removed_at is null)
  execute function public.photos_story_frame();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · trigger 8 — materials are added (0189's moment, batched per org-local day)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- «Added» is the moment a member could first open it (0189:12-17): a link at its insert, a file when its first version
-- is accepted, a removed material restored. It must also be member-visible NOW under materials_read's gate (0116:70):
-- a «قبل» material, or the session completed/archived, or its own day ended. An «بعد» material released by completion
-- makes no frame — the recap carries the materials; one released by its day's end makes none either (DEC-251 §4.4).
-- One frame per session per org-local day, as 0189's batch: a deck and two links are one event.
create function public.materials_story_frame() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_state public.session_state;
  v_tz    text;
begin
  if not (
       (tg_op = 'INSERT' and new.external_url is not null)
    or (tg_op = 'UPDATE' and old.current_version_id is null and new.current_version_id is not null)
    or (tg_op = 'UPDATE' and old.removed_at is not null and new.removed_at is null
        and (new.current_version_id is not null or new.external_url is not null))
  ) then
    return null;
  end if;
  if new.session_id is null or new.removed_at is not null then
    return null;
  end if;

  select s.state into v_state from public.sessions s where s.id = new.session_id;
  if v_state is null or v_state not in ('published', 'in_progress', 'completed', 'archived') then
    return null;
  end if;
  if not (
       new.phase = 'before'
    or v_state in ('completed', 'archived')
    or (new.session_day_id is not null
        and exists (select 1 from public.session_days d where d.id = new.session_day_id and d.ends_at <= now()))
  ) then
    return null;
  end if;

  select coalesce(os.time_zone, 'Asia/Riyadh') into v_tz from public.org_settings os where os.org_id = new.org_id;
  perform public.generate_story_frame(
    new.session_id, 'materials',
    'materials:' || to_char(now() at time zone coalesce(v_tz, 'Asia/Riyadh'), 'YYYY-MM-DD'),
    now());
  return null;
end $$;
revoke all on function public.materials_story_frame() from public, anon, authenticated;

create trigger materials_story_frame
  after insert or update of current_version_id, removed_at on public.materials
  for each row execute function public.materials_story_frame();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5 · the clock — triggers 2, 3, 4 and day k's live (JOB-generate_story_frames, every minute)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Each instant is written once, when due, and only if it falls in (p_now − 24 h, p_now]: a late or doubled run writes
-- nothing twice, and a first deploy does not back-fill history. `triggered_at` is the SCHEDULED instant, so a run that
-- lands a minute late moves no expiry. Returns how many frames it wrote.
create function public.clock_story_frames(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_written int := 0;
  r         record;
  v_id      uuid;
begin
  -- 2 · registration opens — only when a priority window puts it after the publication (0045:52-60).
  for r in
    select s.id, s.published_at + make_interval(hours => os.priority_rsvp_hours) as at
      from public.sessions s
      join public.org_settings os on os.org_id = s.org_id
     where s.state = 'published'
       and s.published_at is not null
       and os.priority_rsvp_hours > 0
       and exists (select 1 from public.perks p where p.org_id = s.org_id and p.key = 'priority_rsvp' and p.enabled)
       and s.published_at + make_interval(hours => os.priority_rsvp_hours) >  p_now - interval '24 hours'
       and s.published_at + make_interval(hours => os.priority_rsvp_hours) <= p_now
  loop
    v_id := public.generate_story_frame(r.id, 'registration_opened', public.story_instant_key(r.at), r.at);
    if v_id is not null then v_written := v_written + 1; end if;
  end loop;

  -- 3 · registration closes — only when the deadline is earlier than the first start (else it IS the start).
  for r in
    select s.id, s.rsvp_deadline_at as at
      from public.sessions s
     where s.state in ('published', 'in_progress')
       and s.rsvp_deadline_at is not null
       and s.starts_at is not null
       and s.rsvp_deadline_at <  s.starts_at
       and s.rsvp_deadline_at >  p_now - interval '24 hours'
       and s.rsvp_deadline_at <= p_now
  loop
    v_id := public.generate_story_frame(r.id, 'registration_closed', public.story_instant_key(r.at), r.at);
    if v_id is not null then v_written := v_written + 1; end if;
  end loop;

  -- 4 · 24 h before each day starts — never dated before the publication; a rescheduled day keys anew.
  for r in
    select s.id as session_id, d.id as day_id, d.starts_at,
           greatest(d.starts_at - interval '24 hours', s.published_at) as at
      from public.session_days d
      join public.sessions s on s.id = d.session_id
     where s.state in ('published', 'in_progress')
       and s.published_at is not null
       and d.starts_at > p_now
       and d.starts_at - interval '24 hours' <= p_now
       and greatest(d.starts_at - interval '24 hours', s.published_at) > p_now - interval '24 hours'
  loop
    v_id := public.generate_story_frame(r.session_id, 'starts_soon',
              r.day_id::text || ':' || public.story_instant_key(r.starts_at), r.at, r.day_id);
    if v_id is not null then v_written := v_written + 1; end if;
  end loop;

  -- 5 · a day goes live while the session runs — day 1 is normally the state trigger's (the same key, so nothing twice).
  for r in
    select s.id as session_id, d.id as day_id, d.starts_at as at
      from public.session_days d
      join public.sessions s on s.id = d.session_id
     where s.state = 'in_progress'
       and d.starts_at <= p_now
       and d.ends_at   >  p_now
       and d.starts_at >  p_now - interval '24 hours'
  loop
    v_id := public.generate_story_frame(r.session_id, 'live', r.day_id::text, r.at, r.day_id);
    if v_id is not null then v_written := v_written + 1; end if;
  end loop;

  return v_written;
end $$;
revoke all on function public.clock_story_frames(timestamptz) from public, anon, authenticated;
grant  execute on function public.clock_story_frames(timestamptz) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══ sessions · 02_story_feed.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- sessions · wave 26, PR D (DEC-251 §4 – §5, contract 4) — what the story feed reads: the frames a member may see, the
-- recap's figures and a live day's count. Functions only; the tables, policies and grants are the lead's (0198).
--
-- Serves:  REQ-STO-002 (gone at its trigger + 24 h, for staff's ring row too) · REQ-STO-003 (the org and nobody else) ·
--          REQ-STO-004 (the live count; the recap's three stats, the rating only at or above the minimum, REQ-RAT-006) ·
--          REQ-STO-006 (seen = every visible frame viewed by me) · REQ-STO-018 (a cancelled session shows nothing)
-- Cites:   0198 (story_frames, story_views, story_frame_is_visible()) · 0010:390-403 (session_rating_aggregates is
--          staff-and-presenter only — so a member's recap needs a definer) · 0165:23 (session_attendance_count) ·
--          0087 (check_ins.removed_at) · 0004:130 (org_settings.rating_min_aggregate)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · story_feed() — the member's view of the frames, for everyone who asks
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER: RLS is the boundary and stays it. On top of it, the member predicate — `story_frame_is_visible()`,
-- the very function the members' policy calls (DEC-251 §5) — so staff, whose policy admits every frame of their org
-- (REQ-STO-017's expired attendee frames), read the same ring row a member does. One definition, never two.
-- And the author's own processing or failed video, to its author alone (DEC-251 §4.6) — where «تعذّر» is said.
create function public.story_feed(p_now timestamptz default now())
returns table (
  frame_id       uuid,
  session_id     uuid,
  session_day_id uuid,
  kind           public.story_frame_kind,
  state          public.story_frame_state,
  triggered_at   timestamptz,
  photo_id       uuid,
  author_id      uuid,
  seen           boolean
)
language sql stable security invoker set search_path = '' as $$
  select f.id, f.session_id, f.session_day_id, f.kind, f.state, f.triggered_at, f.photo_id, f.author_id,
         exists (select 1 from public.story_views v where v.frame_id = f.id and v.member_id = public.auth_member_id())
    from public.story_frames f
   where f.org_id = public.auth_org_id()
     and (
          public.story_frame_is_visible(f, p_now)
       or (f.kind = 'video'
           and f.author_id = public.auth_member_id()
           and f.state in ('processing', 'failed')
           and f.removed_at is null
           and f.triggered_at > p_now - interval '24 hours'
           and exists (select 1 from public.sessions s where s.id = f.session_id and s.state <> 'cancelled'))
     );
$$;
revoke all on function public.story_feed(timestamptz) from public, anon;
grant execute on function public.story_feed(timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · story_recap_figures() — attendance and the rating, never who
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- DEFINER because a member reads no rating row and `session_rating_aggregates` answers staff and presenters only. It
-- answers for a completed or archived session of the caller's org and for nothing else (no row — the same answer as
-- «no such session», so it cannot probe another tenant). The average is NULL below `rating_min_aggregate`; the count
-- and the minimum are returned so the frame can say «بعد N» (REQ-RAT-006).
create function public.story_recap_figures(p_session uuid)
returns table (attended int, rating_count int, rating_avg numeric, rating_min int)
language sql stable security definer set search_path = '' as $$
  select (select count(distinct c.member_id)::int
            from public.check_ins c
           where c.session_id = s.id and c.removed_at is null),
         r.n,
         case when r.n >= os.rating_min_aggregate then r.avg end,
         os.rating_min_aggregate
    from public.sessions s
    join public.org_settings os on os.org_id = s.org_id
    cross join lateral (
      select count(*)::int as n, round(avg(x.session_stars), 1) as avg
        from public.ratings x where x.session_id = s.id
    ) r
   where s.id = p_session
     and s.org_id = public.auth_org_id()
     and s.state in ('completed', 'archived');
$$;
revoke all on function public.story_recap_figures(uuid) from public, anon;
grant execute on function public.story_recap_figures(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · story_live_count() — «23 في القاعة»: a day's active check-ins, a number (A33 rule 3)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- DEFINER to count past `checkins_read` (a member reads their own row). At one day the day is the session, so it equals
-- session_attendance_count(). Null for another org's session or a day not of that session.
create function public.story_live_count(p_session uuid, p_day uuid)
returns int
language sql stable security definer set search_path = '' as $$
  select case
           when exists (select 1 from public.session_days d
                          join public.sessions s on s.id = d.session_id
                         where d.id = p_day and d.session_id = p_session
                           and s.org_id = public.auth_org_id() and s.state <> 'cancelled')
           then (select count(distinct c.member_id)::int
                   from public.check_ins c
                  where c.session_id = p_session and c.session_day_id = p_day and c.removed_at is null)
         end;
$$;
revoke all on function public.story_live_count(uuid, uuid) from public, anon;
grant execute on function public.story_live_count(uuid, uuid) to authenticated;
