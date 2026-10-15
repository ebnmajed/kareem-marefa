# Story media — the client ↔ server contract, and why videos failed

Status: draft · owner: the `story-media` teammate (server + worker half) · branch `fix/story-media-robust` ·
Refs: REQ-STO-011, REQ-STO-012, REQ-STO-016, DEC-248 §5 – §6.

## 1 · THE CONTRACT (the capture UI, `story-client`, codes against this)

> ★ **Amended by DEC-293 (2026-10-15)** — the phone's own camera app makes the file. **No length refusal**: the worker
> keeps the first 15.0 s of any accepted video. **The ceiling is 50 MB** (`52428800`) — 0225 and `ef966ee3` (§8). `too_long` is never written again; it is still
> read on older failed rows.

The bytes never pass through Vercel: every upload is a PUT from the browser straight to Supabase Storage on a signed
upload URL a Route Handler minted after checking the session. Every JSON request carries
`content-type: application/json` and `x-locale: ar|en`. Error bodies are always `{ "error": "<code>", … }`.

### 1.1 · A photograph (unchanged)

| Step | Request | Success | Errors |
|---|---|---|---|
| 1 | `POST /api/upload/photo` `{ sessionId, kind: "jpeg"\|"png"\|"webp", declaredByteSize }` | `201 { photoId, upload: { bucket, path, signedUrl, token, contentType } }` | `400 invalid_input` · `403 not_authorized` · `500 upload_failed` |
| 2 | `PUT upload.signedUrl` with header `content-type: upload.contentType`, body = the bytes | `200` | `413` (bucket limit) · `400` (mime refused) · `403` |
| 3 | `POST /api/stories/photo/complete` `{ photoId, sessionId, path: upload.path, kind, byteSize, caption? (≤ 100) }` | `202 { status: "processing" }` | `400 invalid_input \| caption_too_long` · `403 not_authorized` · `413 file_too_large` · `500 upload_failed` |

After `202` the photograph is **processing** (the worker strips it; DEC-139): say so, close the capture, and refresh.
The server side of the owner's «error page» report returned `201` and `202` (Vercel logs, 13:47:32 – 13:47:34 UTC on
2026-10-14) and the frame is `visible` in production — **the error page is a client render after `router.refresh()`**,
not a failed request (§2.3).

### 1.2 · A video

| Step | Request | Success | Errors |
|---|---|---|---|
| 1 | `POST /api/stories/video` `{ sessionId, ext: "mp4"\|"mov"\|"webm", declaredByteSize (≤ 52428800) }` | `201 { frameId, upload: { bucket: "story-media", path, signedUrl, token, contentType } }` | `400 invalid_input` · `403 not_authorized` · `413 file_too_large` · `500 upload_failed` |
| 2 | `PUT upload.signedUrl` with header `content-type: upload.contentType` (**always the one the server returned, never `file.type`**), body = the bytes | `200` | `413` · `400` · `403` |
| 3 | `POST /api/stories/video/complete` `{ frameId, sessionId, path: upload.path, byteSize, caption? }` — idempotent: a retry of the same `frameId` is `202` again | `202 { status: "processing", frameId }` | as step 1, plus `400 caption_too_long` |
| 4 ★ new | `GET /api/stories/video/{frameId}` — poll every 2 s while `processing`, stop at 90 s | `200 { state: "processing" }` · `200 { state: "visible", durationMs, posterUrl }` · `200 { state: "failed", reason: "too_large"\|"unsupported"\|"failed" }` (`"too_long"` only on frames failed before DEC-293) | `404 not_found` (not yours, removed, or never completed) · `400 invalid_input` |

**Retrying a PUT** (photo and video alike). There is **no upsert**: `story-media` has an insert-only write policy by
design (0199 §A — an uploaded source can never be overwritten), and `photos` likewise. So:
- **do not send `x-upsert`** on the PUT; the signed URL is minted without it;
- a PUT retried after one that actually landed answers **`400` with a JSON body whose `statusCode` is `"409"` /
  `error` `"Duplicate"` / message «The resource already exists» — treat exactly that as success** and go on to
  `/complete`;
- retry only network failures (status 0), `408`, `429` and `5xx`. Every route's own errors are 4xx with
  `{ error }`; its only 5xx is `500 { error: "upload_failed" }` (a database or Storage failure — retryable);
- `/complete` is idempotent on its id (a frame or photo already recorded answers `202` again), so retry it freely;
- a signed upload URL is valid for 2 hours; past that, start over at step 1 (a new id).
- No TUS/resumable endpoint: one PUT of up to 50 MB, retried whole if it drops.

**Choosing `ext`** — the worker sniffs the bytes and never trusts the extension, so `ext` only picks the PUT's content
type (the bucket admits `video/mp4`, `video/quicktime`, `video/webm`):
- `video/quicktime` → `mov`;
- `video/webm`, `video/x-matroska` → `webm`;
- **everything else that is a video** — `video/mp4`, `video/x-m4v`, `video/3gpp`, `video/3gpp2`, an empty `file.type` on
  a file whose name ends in `.mp4`/`.m4v`/`.3gp` — → `mp4`.
- A recorder's blob: the base of `MediaRecorder.mimeType` by the same table.

**What the server accepts** (decided by `ffprobe` on the bytes that landed, never the client's word):
- containers: ISO-BMFF / QuickTime (mp4, mov, m4v, 3gp) and EBML (webm, mkv);
- video: H.264, HEVC (an iPhone's default), VP8, VP9, AV1, MPEG-4 Part 2; up to 4096 px a side;
- audio: AAC, Opus, Vorbis, MP3, ALAC, FLAC, AC-3, AMR, PCM — an audio track the worker cannot decode (an iPhone 16's
  spatial-audio APAC track) is **dropped, not refused**; the first decodable one is kept;
- **any length** — the rendition is **the first 15.0 s** of what was uploaded, and the rest is never stored (DEC-293 §3).
  A video shorter than 15 s is kept whole. A file with no duration in its header (a MediaRecorder WebM) is fine;
- ≤ **50 MB** (`52428800` bytes) by the object's own length — the bucket refuses a larger PUT itself (`413`/`400`),
  and the worker refuses `too_large` if one ever lands.

**What the client must do with each outcome**
- `processing` — the author sees «قيد المعالجة» on their own frame; **never a black tile**: draw the local preview (the
  object URL it still holds) or a neutral panel with the word.
- `visible` — the frame plays for everyone; `posterUrl` is a signed URL (10 minutes).
- `failed` — **only the author** sees it, with the word for the reason:
  `too_large` «أكبر من 50 ميغابايت» · `unsupported` «صيغة غير مدعومة» · `failed` «تعذّر» · (an old row's `too_long`:
  «أطول من 15 ثانية»).
  Nobody else ever sees a failed frame (RLS — `story_frames_read_own`).

**The client's own courtesy checks** use the server's figure — `STORY_VIDEO_MAX_BYTES` from `@/lib/storage/limits`
(52428800): refuse a file over it at once, before the PUT, in a word; **never refuse for length** (DEC-293 §3) — a
longer video is uploaded and the worker keeps its first 15 s.

## 2 · WHY IT FAILED — the evidence

### 2.1 · The video — `too_long`, on a recording the app stopped itself

Production (read only): the one video frame, `8c70f551-…`, created 2026-10-14 13:42:24 UTC, is `state = failed`,
`failure_reason = too_long`. The worker's log at 13:42:32: `transcode_story_video: 8c70f551-… refused (too_long) —
ffprobe: too_long`. The three requests (`/api/stories/video` 201, the PUT, `/complete` 202) all succeeded — **the
upload worked; the worker refused the bytes.**

Reproduced locally with the capture's exact recorder logic (`rec.start(250)`, an interval stopping at `≥ 15 s`), in
Playwright's WebKit (Safari's engine — the owner's phone) and Chromium, probed with the worker image's own `ffprobe`
(`kareem-worker:latest`, ffmpeg 5.1.9 from Debian):

| Recording | `format.duration` | Old verdict (`≤ 15.1 s`) |
|---|---|---|
| WebKit `video/mp4` (H.264/AAC), «15 s» | **15.233** | ★ `too_long` — the owner's failure |
| WebKit `video/mp4`, 3 s | 2.995 | ok |
| Chromium `video/mp4` (VP9/Opus in MP4), «15 s» | 15.000 | ok (fast fake camera; a real phone overshoots) |
| Chromium / WebKit `video/webm` (VP8 or VP9 + Opus), any length | **N/A** | ★ `unsupported` — every WebM ever recorded |

Two server defects, then: **(a)** a 0.1 s tolerance against a client that cannot stop within 0.1 s (the poll interval
alone is 250 ms, and Safari's audio track runs past the video's); **(b)** MediaRecorder's WebM carries no duration, and
`Number("N/A")` is `NaN`, which `judgeProbe()` refused as `unsupported` — so on any browser that records WebM (Firefox,
older Chrome on Android) no video could ever succeed.

### 2.2 · The black tile and «تعذّر»

A failed frame has **no poster** by construction (`fail_story_video()` clears it; the rendition never existed). The
«تعذّر» the author read is correct for a failed frame — the defect is that it was the frame failing at all (§2.1) and
that the word did not say why (`failure_reason` was stored and never shown). The black image is the client drawing a
video tile with `thumbUrl = null` (`AttendeeStoryFrame.thumbUrl` is null for every non-visible video; the author's own
frame likewise) — `story-client`'s to draw as the panel in §1.2. The poster itself was cut at `min(0.5 s, d/2)`, which
on a phone's first, still-dark frames can be black: it now comes from the `thumbnail` filter over the frames after
`min(1 s, d/4)` (§3).

### 2.3 · The photograph's error page

Server side clean: `POST /api/upload/photo` 201, `POST /api/stories/photo/complete` 202, then
`GET /ar/app/sessions/aa6981a7-…` 200 (Vercel, 13:47:32 – 13:47:35 UTC); no error was logged by any function in that
window; frame `6d9ad625-…` is `visible`. The error page is therefore thrown **in the browser** while re-rendering after
`router.refresh()` — handed to `story-client` with the timestamps.

## 3 · WHAT CHANGED ON THE SERVER

- `worker/src/content/video.ts`:
  - `STORY_VIDEO_TOLERANCE_SECONDS` 0.1 → **1.0**; the rendition is trimmed to **exactly 15.0 s** (`-t 15`), so no
    stored video is ever longer than the rule;
  - `durationFromProbe()` (format → longest stream) and, when both are absent, `packetEndArgs()` +
    `parsePacketEnd()` — the end of the last packet within the first 60 s, which is how a MediaRecorder WebM is
    measured;
  - `pickStreams()` — the first video stream in the allowlist and the first **decodable** audio stream, mapped by
    absolute index; an undecodable audio track is dropped, not a reason to refuse; MPEG-4 Part 2 and more audio
    codecs admitted;
  - `posterArgs()` — `thumbnail` over ≈ 1 s of frames after `min(1 s, d/4)`, from the stripped rendition.
- `worker/src/tasks/transcode_story_video.ts` — uses the above; logs the measured duration and its source on refusal;
  records the duration **of the rendition**.
- `src/app/api/stories/video/[frameId]/route.ts` (new) and `getMyStoryVideoStatus()` in `src/lib/dal/story-frames.ts` —
  the author's poll (§1.2 step 4), read under the caller's own RLS.
- `AttendeeStoryFrame.failureReason` — the staff strip can say why, too.

No SQL changes. No table, column, policy or grant. No Dockerfile change (ffmpeg 5.1 has `thumbnail`, `-fpsmax`,
libdav1d). No new job.

## 4 · THE CLIENT — `story-client`'s section (the phone, until the bytes leave it, and what the author sees after)

### 4.1 · What was wrong on the phone (read from `capture-flow.tsx` / `ui/story-capture.tsx` at `ec043340`)

| # | Defect | Effect the owner saw |
|---|---|---|
| C1 | `router.refresh()` fired **inside** the open capture after `/complete` (and again by the parent on close). The page re-rendered around a live Radix portal in the play scope. | The photo's «error page, then it uploaded» — server side clean (§2.3), so the throw was the client's re-render under the dialog. |
| C2 | The 15 s stop was a 250 ms **poll** whose clock started before `start()`; Safari's track runs past it. | 15.23 s recordings → `too_long` (§2.1) — the video's «تعذّر». |
| C3 | After any upload failure the state became `error`, which `ui/story-capture` drew as the **idle shutter over the old take**: no retry, no way back but «إغلاق». | «The video errored out completely.» |
| C4 | The review `<video src=blob:>` had no poster; iOS paints a blob video black until it plays. A frame with no thumbnail drew an empty dark tile on SCR-044. | «A black image for the video.» |
| C5 | The recording's Blob was typed and its `ext` chosen from the **requested** mimeType, not what the recorder wrote; an empty recording (0 bytes) would have been uploaded. | — (latent) |
| C6 | Photos uploaded at full sensor size, unrotated; one `fetch` PUT, no progress, no timeout, no retry. A 200 that was an HTML page (a redirect) would have counted as success. | Slow, fragile on room Wi-Fi. |
| C7 | A gallery video was refused at 15.1 s — stricter than the server; a refused pick disabled the shutter. | — |

### 4.2 · The design (built)

- **`src/components/stories/media.ts`** (new, pure): `pickRecorderType()` feature-detects in order H.264/AAC MP4 →
  WebM VP9 → VP8 → WebM → bare MP4 (iOS gets MP4, Chrome gets H.264 where it has it, WebM otherwise);
  `sniffVideoExt()` reads the container from the bytes (EBML → webm, `ftyp` → mp4, `ftypqt` → mov); `videoDuration()`
  with WebM's `Infinity` worked around (seek past the end) and a timeout; `videoPoster()` cuts a still from the take;
  `preparePhoto()` redraws a photograph upright (`imageOrientation: "from-image"`) at ≤ 2048 px as JPEG 0.88 — no
  metadata leaves the phone — falling back to the original after 8 s or when the phone cannot decode it.
- **`src/components/stories/upload.ts`** (new): `putBlob()` by XHR (progress, timeout scaled to size, abort, never `x-upsert` — a `400 Duplicate` on a retried PUT means it landed),
  `postJson()` (a redirect or non-JSON 200 is a failure), `withRetry()` — 3 attempts, 1 s / 2 s backoff with jitter,
  **only** for status 0, 408, 429, 5xx; a 4xx is an answer.
- **`capture-flow.tsx`**: the recorder records with a 1 s timeslice; the 15 s stop is a `setTimeout` armed at `start()`
  and re-armed by `onstart`; the Blob takes the recorder's actual type and the ext is re-sniffed from the bytes before
  `/api/stories/video`; 0 bytes → «قصير جدًا», never uploaded. A **ticket** remembers which step succeeded (init, PUT),
  so «أعد المحاولة» resumes — one upload slot, one frame. The bar reads 5 % (init) → 95 % (bytes) → 100 %.
  - photo `202` → toast «جارٍ التجهيز» and **close**; the parent refreshes after the dialog is gone (C1).
  - video `202` → «جارٍ التجهيز» over the take's own still, then the author's poll (§1.2 step 4, every 2 s, 90 s):
    `visible` closes the capture; `failed` with `too_long` / `too_large` / `unsupported` hands the camera back with the
    word; `failed`/other keeps the take with «أعد المحاولة» (a fresh upload); `404` is not followed.
  - ★ superseded by `DEC-293`: no length refusal on the phone (the worker keeps the first 15 s); a video over
    52428800 bytes is refused at once, «أكبر من 50 ميغابايت»; a kind it cannot read → «صيغة غير مدعومة».
  - closing aborts whatever is in flight; nothing writes state after unmount.
- **`ui/story-capture.tsx`**: `error` keeps the take — «أعد» and «أعد المحاولة» (`labels.retry`); `uploading` draws a
  `progressbar` (scaleX, no transition, reduced-motion safe); `refused` re-enables the shutter. Every control stays a
  tap; the hold remains the enhancement, never the only path (DEC-093).
- **`attendee-stories-client.tsx`**: a frame with no thumbnail is a neutral raised panel with the kind's glyph, never a
  dark empty box (C4).

### 4.3 · Strings (sessions' `stories.json`, add-only — requested from the lead)

`capture.uploading` «جارٍ الرفع {percent}» · `capture.retry` «أعد المحاولة» · `capture.tooShort` «قصير جدًا» ·
`capture.unsupported` «صيغة غير مدعومة» · `capture.offline` «لا اتصال».

### 4.4 · Evidence and what changed in the suites

- New: `tests/components/stories/{media,upload}.test.tsx` (19 cases), `capture-flow.test.tsx` +10 cases (iOS-like and
  Chrome-like recorders, a misreporting recorder corrected by the bytes, a dropped PUT retried then resumed, a 403 never
  retried, an empty recording, the 15 s timer, the poll's ready and refusal, a gallery photograph closing the capture),
  `tests/components/ui/story-capture.test.tsx` +3 (progress, error with retry, refused shutter).
- New e2e: `tests/e2e/story-media-capture.spec.ts` (fake camera; photo publish with no error boundary; video by taps
  with progress/processing, visible under `E2E_WORKER=1`; a dropped PUT kept and resumed).
- ★ **Ledger line for the lead** — `tests/e2e/wave26-content-story-attendee.spec.ts` (test 1): after «انشر» on a gallery
  photograph the capture now **closes** and the toast says «جارٍ التجهيز»; the assertion
  `expect(capture.getByRole("status")).toHaveText("جارٍ التجهيز")` becomes
  `await expect(capture).toBeHidden(); await expect(page.getByText("جارٍ التجهيز", { exact: true })).toBeVisible();`
  — an expectation that moved, by design (C1).

### 4.5 · On a real phone (the lead / the owner)

★ Since `DEC-293` (the phone's own camera): iOS Safari and Android Chrome, each — «أضف» → «فيديو» opens the Camera
app → film 5 s → our review → «انشر» → bar → «جارٍ التجهيز» → visible; film 40 s → accepted, the story shows the first
15 s; «صورة» → take a photo → closes with the toast, **no error page**; «من الاستوديو» → an iPhone HEVC `.mov` →
visible; a gallery video over 50 MB → «أكبر من 50 ميغابايت» at once; airplane mode mid-upload → «لا اتصال» with the take
kept → back online → «أعد المحاولة» → visible. Open the capture from the viewer's «أضف», the ring's «قصتك» and the
event page's «أضف إلى القصة», with Safari's toolbar shown and collapsed: close and the three choices are on screen.

## 5 · THE SERVER, MEASURED — real recordings through the worker's own arguments

Every file below went through `sniffVideoContainer → ffprobe → (packets) → judgeProbe → ffmpeg → audit → poster →
cwebp`, the functions of `worker/src/content/video.ts` as committed, inside `kareem-worker:latest` (ffmpeg 5.1.9, Debian).
The browser files were recorded by the capture's own recorder logic in Playwright with a fake camera.

| Source | Measured | Verdict → rendition | Audit | Poster YAVG |
|---|---|---|---|---|
| WebKit MP4 H.264/AAC «15 s» (the owner's case) | 15.233 s, container | ok → 15.007 s | clean | 33.7 |
| WebKit MP4 3 s | 2.995 s | ok → 2.973 s | clean | 33.9 |
| WebKit WebM VP8 / VP9 «15 s» | 15.348 / 15.325 s, **packets** | ok → 15.0 s | clean | 33.8 |
| Chromium MP4 (VP9/Opus in MP4) 15 s / 3 s | 15.000 / 2.989 s | ok → 15.0 / 3.06 s | clean | 93.4 |
| Chromium WebM VP8 / VP9 15 s / 3 s | 15.001 – 3.000 s, **packets** | ok | clean | 92 – 93 |
| HEVC `.mov` 1920 × 1080, location + Apple make tags, 12 s | 12.000 s | ok → 12.005 s, no `+24.7136` in its bytes | clean | 124.1 |
| H.264 MP4 15.8 s | 15.800 s | ok → **trimmed to 15.0 s** | clean | 122.2 |
| H.264 MP4 20 s | 20 s | **refused `too_long`** | — | — |
| VP8 WebM, live (no duration), 20 s | 20 s, **packets** | **refused `too_long`** | — | — |
| ALAC audio `.mov` 3 s | 3.000 s | ok (audio kept as AAC) | clean | 122.4 |
| H.264 MP4, first 1.5 s black | 4.000 s | ok | clean | **125.7** (the old `-ss 0.5` frame is black) |

`tests/unit/story-video-strip.test.ts` — the fixture suite against the binaries — **6/6 green inside the image** with
`REQUIRE_FFMPEG=1` (the three new cases: a duration-less WebM measured by packets, 15.8 s trimmed, the poster past a
black start). Locally it skips (no ffmpeg on the laptop), as before.

## 6 · FOR THE LEAD

- **Nothing to promote**: no migration, no proposed SQL, no job registration, no Dockerfile change, no env change.
  Supabase's `story-media` bucket stays as 0198 made it (60 MB, `video/mp4`, `video/quicktime`, `video/webm`,
  `image/webp`) — the client maps every other video MIME type onto one of those (§1.2).
- The worker must redeploy for the fix to reach production (Railway builds from `main` after the merge). A video
  uploaded before that is judged by the old code.
- `tests/unit/story-video-strip.test.ts` needed a 60 s timeout on its existing 20-second case (it timed out at
  vitest's 5 s default inside the image, before any of this). Not a changed assertion.
- Seen in the production logs while looking, **not story media, not touched**:
  1. `send_notification` fails with Resend `429` (10 requests/s) in bursts — retried by graphile, but a fan-out
     burst exceeds the account's rate (worker log, 2026-10-14).
  2. `evaluate_alerts` reports `job_exhausted, storage_prefix_violation` every minute; `assert_storage_prefixes`
     names `materials/8601993f-…/sessions/b1d6bf5d-…/materials/…/presentation.pdf` — «first segment is not a known
     org id» (an org deleted with its objects left?).
  3. The report-only CSP's `img-src` lacks the Supabase origin, so every signed photo URL files a `csp-report`
     (`src/proxy.ts:156`). Harmless while report-only; it would blank every photo the day it is enforced.
  4. `GET /ar/app/admin/sessions/aa6981a7-…/attendance` threw `sessions: JWT issued at future` (13:56:14 UTC) — a
     clock-skew refusal of a freshly refreshed token, rendered as the error page.

## 7 · «JWT issued at future» — measured, and the proposed fix (lead-only files, not edited)

### 7.1 · Was it the owner's photo error page? — No, by the timestamps

Every «issued at future» Vercel logged on 2026-10-14 (query `issued at future`, the whole day; `PGRST303` itself is
never in the message):

| UTC | Route | Status | Where it surfaced |
|---|---|---|---|
| 06:14:38 | `GET /ar/app` | 200 | `feed_announcements` — caught, the home rendered without it |
| 07:05:28 | `GET /ar/app` | 200 | `members (achievements)` — caught, likewise |
| 08:20:39 | `GET …/admin/sessions/aa6981a7-…/attendance` | 200 | `session_days.select` → **error page** (streamed) |
| 09:25:52 | `GET /ar/app` | 200 | `member_seen_marks` → **error page** (streamed) |
| 11:57:50 | `GET …/attendance` | **500** | `me()` → **error page** |
| 13:56:14 | `GET …/attendance` | 200 | `sessions` → **error page** (streamed) |

The owner's photo was 13:47:32 (`/api/upload/photo` 201) – 13:47:34 (`/complete` 202), then
`GET /ar/app/sessions/aa6981a7-…` 200 at 13:47:35; **no error of any kind** was logged by a function between 13:30
and 14:00 except the 13:56 row — nine minutes later, on another route. The photo's error page did not come from the
server, so it is the client's (`story-client`'s C1, §4.1). ★ But the defect is real and independent: **six times in
one day** a member got the error page (or a home missing a section) for nothing they did, four of them on pages that
are the owner's daily tools.

### 7.2 · Where it comes from

`src/lib/supabase/server.ts` builds the client with `@supabase/ssr`'s defaults — no `global.fetch` — and every DAL
module throws on a PostgREST error (`if (error) throw new Error(\`<table>: ${error.message}\`)`), so a `401`
`{ "code": "PGRST303", "message": "JWT issued at future" }` becomes the route's error boundary. The token is
legitimate: `proxy.ts` refreshes an expired access token on the way in (`refreshSession()`, `jwt_expiry` 900 s), Auth
mints it with `iat` = Auth's clock, and the very same request then presents it to PostgREST, which compares `iat` to
**its** clock. When PostgREST's clock trails Auth's by more than its leeway, the brand-new token is «from the future»
for a moment. That matches the pattern: each occurrence is the first request after a refresh (a member returning to
the app after ≥ 15 minutes), never a sequence. `getClaims()` (the DAL's session check) verifies locally and does not
look at `iat`, which is why the session itself passes and the first table read fails.

### 7.3 · The fix — one wrapper in the server client, nothing in 60 DAL modules

PostgREST refuses a PGRST303 at the authentication stage, **before any SQL runs**, so repeating the identical request
is safe even for an RPC that writes. Wait, try again, at most twice (1 s, then 2 s — 3 s worst case, on a path that
otherwise shows the error page). Only `401` with body code `PGRST303` is retried; every other response, every other
401 (an expired or bad token, `PGRST301`/`PGRST302`) passes straight through. Storage and Auth calls go through the
same fetch and are untouched unless they answer exactly that.

New file `src/lib/supabase/skew-retry.ts` (lead-only path):

```ts
// PostgREST refuses a token whose `iat` is ahead of ITS clock (PGRST303, «JWT issued at future», 401) — at the
// authentication stage, before any SQL runs, so repeating the identical request is safe even for an RPC that writes.
// A token Auth has just minted (proxy.ts refreshes on the way in) can reach a PostgREST whose clock trails Auth's; a
// second later the same token is accepted. So: wait, then try again, at most twice. notes/story-media.md §7.
const SKEW_CODE = "PGRST303";
const WAITS_MS = [1000, 2000];

export function withClockSkewRetry(base: typeof fetch = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): typeof fetch {
  return async (input, init) => {
    let res = await base(input, init);
    for (const wait of WAITS_MS) {
      if (res.status !== 401 || !(await isSkew(res))) return res;
      await sleep(wait);
      res = await base(input, init);
    }
    return res;
  };
}

async function isSkew(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as { code?: unknown } | null;
    return body?.code === SKEW_CODE;
  } catch {
    return false;
  }
}
```

`src/lib/supabase/server.ts`:

```diff
 import { createServerClient as createSsrClient } from "@supabase/ssr";
 import { supabaseEnv } from "@/lib/supabase/env";
+import { withClockSkewRetry } from "@/lib/supabase/skew-retry";
@@
   return createSsrClient(url, key, {
+    // A token minted a moment ago can be «issued at future» to PostgREST's clock (PGRST303): retried, not shown as an
+    // error page. skew-retry.ts.
+    global: { fetch: withClockSkewRetry() },
     cookies: {
```

(`@supabase/ssr` spreads `options.global` into the client, and supabase-js sets `Authorization` before calling the
given fetch, so the wrapper sees the final request; PostgREST's bodies are strings, so `init` is reusable.)

**Test** (`tests/unit/supabase-skew-retry.test.ts`, the lead's): a 401 PGRST303 then 200 → 200 after one 1 s wait; three
PGRST303 → the third 401 returned after waits [1000, 2000], body still readable; a 401 `PGRST301` → returned at once,
one call; a 401 with a non-JSON body → returned at once. I ran exactly these four against the code above with node
(`--experimental-strip-types`) — all pass.

**Also worth the lead's call** (not required by the fix): the wrapper turns the symptom into a ≤ 3 s delay; if it keeps
firing, the skew is on Supabase's side (Auth vs PostgREST hosts) and is a support ticket with these six timestamps.

## 8 · THE CEILING — 50 MB (DEC-293 §3)

**`STORY_VIDEO_MAX_BYTES = 52428800`** — one constant in `packages/storage-paths/src/content.ts`, re-exported by the DAL,
the worker and `src/lib/storage/limits.ts` (the capture's client-safe door); the bucket's `file_size_limit` and
`begin_story_video()`'s declared-size check hold the same figure in 0225 (the lead's, `ef966ee3`).

**Why 50 and not more:** the project is on Supabase's Free plan, whose project-wide upload limit is fixed at 50 MB and
caps every bucket — a larger bucket figure would never be reached. That holds about 50 s of an iPhone's default
1080p30 HEVC (≈ 60 MB a minute, Apple's figure) and less at 4K; a clip over it is refused on the phone at once, and
trimming to 15 s happens on the worker for everything under it. Raising it means a paid plan first.
