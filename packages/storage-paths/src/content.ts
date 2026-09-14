// The M5 shapes — materials, converted PDFs, rendered pages, photos (07 §3, §9.2).
// Owned by the content pipeline; the designer shapes live in ./designer.ts.
import { assertPageNumber, assertSafeFilename, assertSafeSegment, assertUuid } from "./guards.js";

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

/** `materials/{org_id}/sessions/{session_id}/materials/{version_id}/converted.pdf` — the intermediate
 *  PDF `convert_document` produces from a PowerPoint before `render_pages` reads it. Same bucket and
 *  version folder as the source (07 §4.2's converter never needs credentials to read it: the worker
 *  hands it two signed URLs), a fixed filename distinct from whatever the presenter uploaded. */
export function convertedPdfPath(orgId: string, sessionId: string, versionId: string): string {
  return [assertUuid(orgId, "orgId"), "sessions", assertUuid(sessionId, "sessionId"), "materials", assertUuid(versionId, "versionId"), "converted.pdf"].join(
    "/",
  );
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

