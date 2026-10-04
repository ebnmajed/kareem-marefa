// The M5 shapes — materials, converted PDFs, rendered pages, photos (07 §3, §9.2).
// Owned by the content pipeline; the designer shapes live in ./designer.ts.
import { InvalidStoragePathError, assertPageNumber, assertSafeFilename, assertSafeSegment, assertUuid } from "./guards.js";

/** `materials/{org_id}/sessions/{session_id}/materials/{version_id}/{filename}` — the source upload (07 §3). */
export function materialSourcePath(orgId: string, sessionId: string, versionId: string, filename: string): string {
  return [
    assertUuid(orgId, "orgId"),
    "sessions",
    assertUuid(sessionId, "sessionId"),
    "materials",
    assertUuid(versionId, "versionId"),
    assertSafeFilename(filename, "filename"),
  ].join("/");
}

/** `materials/{org_id}/proposals/{proposal_id}/materials/{version_id}/{filename}` — REQ-PRO-004's
 *  draft materials, before the proposal ever becomes a session. Same segment shape and position
 *  as `materialSourcePath` (org/‹kind›/id/materials/version/filename) other than the literal
 *  `proposals` in place of `sessions` — `materials_storage_write`/`_read` (03 §6, amended
 *  proposed/content/0009) read segment [2] to tell the two apart and segment [5] (the version id)
 *  identically either way. */
export function proposalMaterialSourcePath(orgId: string, proposalId: string, versionId: string, filename: string): string {
  return [
    assertUuid(orgId, "orgId"),
    "proposals",
    assertUuid(proposalId, "proposalId"),
    "materials",
    assertUuid(versionId, "versionId"),
    assertSafeFilename(filename, "filename"),
  ].join("/");
}

/** `material-pages/{org_id}/sessions/{session_id}/pages/{version_id}/{n}.webp` — a rendered page image. */
export function materialPagePath(orgId: string, sessionId: string, versionId: string, page: number): string {
  return [
    assertUuid(orgId, "orgId"),
    "sessions",
    assertUuid(sessionId, "sessionId"),
    "pages",
    assertUuid(versionId, "versionId"),
    `${assertPageNumber(page, "page")}.webp`,
  ].join("/");
}

/** `material-pages/{org_id}/sessions/{session_id}/pages/{version_id}/thumbs/{n}.webp` — that page's thumbnail. */
export function materialPageThumbnailPath(orgId: string, sessionId: string, versionId: string, page: number): string {
  return [
    assertUuid(orgId, "orgId"),
    "sessions",
    assertUuid(sessionId, "sessionId"),
    "pages",
    assertUuid(versionId, "versionId"),
    "thumbs",
    `${assertPageNumber(page, "page")}.webp`,
  ].join("/");
}

/** `photos/{org_id}/sessions/{session_id}/photos/{photo_id}.{ext}` (07 §9.2, amended DEC-047).
 *  The browser PUTs its raw bytes to exactly this path — `photos_storage_read` (03 §6) denies
 *  everyone, including the uploader, until a matching `public.photos` row exists, and that row
 *  cannot exist unstripped (`check (exif_stripped)`, 0037) — so the object is never retrievable
 *  with EXIF intact even though the write and the strip are not the same statement. `ext`
 *  defaults to `webp` (07 §3's literal table); DEC-047 defers re-encoding, so the worker's own
 *  caller (worker/src/content/paths.ts) passes the sniffed kind's real extension instead. */
export function photoPath(orgId: string, sessionId: string, photoId: string, ext: "jpg" | "png" | "webp" = "webp"): string {
  return [
    assertUuid(orgId, "orgId"),
    "sessions",
    assertUuid(sessionId, "sessionId"),
    "photos",
    `${assertUuid(photoId, "photoId")}.${assertSafeSegment(ext, "ext")}`,
  ].join("/");
}


/** `photo-albums/{org_id}/sessions/{session_id}/albums/{build_id}/part-{n}.zip` — one self-contained
 *  part of a session's album (REQ-ADM-021, DEC-182). `photo_albums_storage_read` (0156) reads
 *  segment [3] as the session and segment [5] as the build, and admits only the album's CURRENT,
 *  ready, unexpired build — so a request that replaces the build makes every older part
 *  unreadable at once. `record_photo_album_built()` refuses a part outside this build's prefix. */
export function photoAlbumPartPath(orgId: string, sessionId: string, buildId: string, part: number): string {
  return [photoAlbumBuildPrefix(orgId, sessionId, buildId), `part-${assertPageNumber(part, "part")}.zip`].join("/");
}

/** `{org_id}/sessions/{session_id}/albums/{build_id}` — every part of one build. */
export function photoAlbumBuildPrefix(orgId: string, sessionId: string, buildId: string): string {
  return [photoAlbumPrefix(orgId, sessionId), assertUuid(buildId, "buildId")].join("/");
}

/** `{org_id}/sessions/{session_id}/albums` — every build of one session's album; the job lists it
 *  to delete the builds a new one replaced. No day ever appears in it. */
export function photoAlbumPrefix(orgId: string, sessionId: string): string {
  return [assertUuid(orgId, "orgId"), "sessions", assertUuid(sessionId, "sessionId"), "albums"].join("/");
}

// ─── wave 26 — session stories (REQ-STO-012, REQ-STO-016, DEC-248 §6, DEC-251 §5) ──────────────────────────────

/** `photos/{org_id}/sessions/{session_id}/photos/story/{photo_id}.webp` — a photograph's `story` derivative, 1080 px
 *  on the long side. ★ A SUB-FOLDER, never `{photo_id}.story.webp`: `photos_storage_read` (0156) casts the file name
 *  minus its LAST extension to a uuid, so `{id}.story` would make the policy raise for every signing in the bucket.
 *  Here the file name is `{photo_id}.webp`, so the derivative is read under exactly its photograph's visibility. */
export function photoStoryPath(orgId: string, sessionId: string, photoId: string): string {
  return [
    assertUuid(orgId, "orgId"),
    "sessions",
    assertUuid(sessionId, "sessionId"),
    "photos",
    "story",
    `${assertUuid(photoId, "photoId")}.webp`,
  ].join("/");
}

export type StoryVideoSourceExt = "mp4" | "mov" | "webm";
const STORY_VIDEO_SOURCE_EXTS: readonly StoryVideoSourceExt[] = ["mp4", "mov", "webm"];

/** `story-media/{org_id}/sessions/{session_id}/frames/{frame_id}` — every object of one video frame. The bucket's
 *  write policy (0198) reads segment [3] as the session for the capture gate; its read policy reads segment [5] as the
 *  frame and admits only `video.mp4` and `poster.webp` of a frame the caller may see. No day ever appears in it. */
export function storyFramePrefix(orgId: string, sessionId: string, frameId: string): string {
  return [assertUuid(orgId, "orgId"), "sessions", assertUuid(sessionId, "sessionId"), "frames", assertUuid(frameId, "frameId")].join("/");
}

/** `…/frames/{frame_id}/source.{mp4|mov|webm}` — what the browser PUTs. Read by the worker alone; deleted once the
 *  rendition exists or the transcode fails. */
export function storyVideoSourcePath(orgId: string, sessionId: string, frameId: string, ext: StoryVideoSourceExt): string {
  if (!STORY_VIDEO_SOURCE_EXTS.includes(ext)) throw new InvalidStoragePathError("ext", String(ext));
  return `${storyFramePrefix(orgId, sessionId, frameId)}/source.${ext}`;
}

/** `…/frames/{frame_id}/video.mp4` — the one H.264/AAC rendition, every container tag stripped. */
export function storyVideoPath(orgId: string, sessionId: string, frameId: string): string {
  return `${storyFramePrefix(orgId, sessionId, frameId)}/video.mp4`;
}

/** `…/frames/{frame_id}/poster.webp` — the poster frame, taken from the stripped rendition. */
export function storyVideoPosterPath(orgId: string, sessionId: string, frameId: string): string {
  return `${storyFramePrefix(orgId, sessionId, frameId)}/poster.webp`;
}
