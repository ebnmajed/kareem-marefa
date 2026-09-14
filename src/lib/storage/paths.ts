import "server-only";

// The single storage path builder — 07-content-pipeline.md §3, 03-permissions-rls.md §6.
//
// "Paths are built by one server-side function. This is the only place in
// the whole design where isolation depends on application correctness
// rather than on a constraint" (03 §6). No route, action or job may build a
// storage path any other way — every function here returns a path already
// shaped to match one of the six bucket policies' `(storage.foldername(name))`
// expectations exactly, so a caller can never construct a path that a
// policy would misread as belonging to another org.
//
// Every segment taken from caller-controlled data (org/session/version/
// photo/asset/document ids, filenames, extensions) is validated before it is
// interpolated. A rejected segment throws — callers never receive a path
// built from an unsafe value.
//
// The worker (`worker/src/content/**`) needs the same shapes for
// `render_pages` (it mints brand-new per-page paths, not paths read back
// from a row) but is a separate TypeScript project with no path back into
// `src/`. Until there is a shared workspace package for this (a
// `packages/*` decision, not this track's to make alone — package.json is
// lead-only), `worker/src/content/paths.ts` is a small, comment-linked port
// of the five functions the worker actually needs (materialPagePath,
// materialPageThumbPath) — see that file's header. Every shape below is
// covered by tests/unit/storage-paths.test.ts on both sides.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
// A filename kept for display/extension purposes only — never a path. No
// separators, no null bytes, no leading dot (hidden files, "." or "..").
const SAFE_FILENAME_RE = /^[^/\\\0]+$/;
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

export class InvalidStoragePathError extends Error {
  constructor(label: string, value: string) {
    super(`storage path: ${label} is not valid: ${JSON.stringify(value)}`);
    this.name = "InvalidStoragePathError";
  }
}

function assertUuid(value: string, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new InvalidStoragePathError(label, value);
  return value;
}

function assertSha256(value: string, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) throw new InvalidStoragePathError(label, value);
  return value.toLowerCase();
}

function assertPageNumber(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 100_000) throw new InvalidStoragePathError(label, String(value));
  return value;
}

/** A filename kept verbatim in the path (the source upload's own name), sniffed on content — never trusted for anything but display and this one path segment. */
function assertSafeFilename(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 255 || value === "." || value === ".." || !SAFE_FILENAME_RE.test(value)) {
    throw new InvalidStoragePathError(label, value);
  }
  return value;
}

/** A short, closed-vocabulary segment — an extension or an export preset name. Never free text. */
function assertSafeSegment(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64 || !SAFE_SEGMENT_RE.test(value)) {
    throw new InvalidStoragePathError(label, value);
  }
  return value;
}

export type Bucket = "materials" | "material-pages" | "photos" | "design-assets" | "exports" | "fonts";

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

/** `design-assets/{org_id}/design/assets/{asset_id}.{ext}` — admin-only, DEC-009 never accepts an `svg` extension here. */
export function designAssetPath(orgId: string, assetId: string, ext: "png" | "jpg" | "webp"): string {
  return [assertUuid(orgId, "orgId"), "design", "assets", `${assertUuid(assetId, "assetId")}.${assertSafeSegment(ext, "ext")}`].join("/");
}

/** `exports/{org_id}/exports/{document_id}/{preset}.{ext}` — worker-written only. */
export function exportPath(orgId: string, documentId: string, preset: string, ext: string): string {
  return [
    assertUuid(orgId, "orgId"),
    "exports",
    assertUuid(documentId, "documentId"),
    `${assertSafeSegment(preset, "preset")}.${assertSafeSegment(ext, "ext")}`,
  ].join("/");
}

/** `fonts/{sha256}.{ext}` — content-addressed, deliberately not org-prefixed (REQ-DSG-016, 07 §3). */
export function fontPath(sha256: string, ext: "woff2" | "ttf"): string {
  return `${assertSha256(sha256, "sha256")}.${assertSafeSegment(ext, "ext")}`;
}

/** The bucket + path pair a caller actually needs to hand to Storage. */
export interface StorageLocation {
  bucket: Bucket;
  path: string;
}

export const storagePaths = {
  materialSource: (orgId: string, sessionId: string, versionId: string, filename: string): StorageLocation => ({
    bucket: "materials",
    path: materialSourcePath(orgId, sessionId, versionId, filename),
  }),
  convertedPdf: (orgId: string, sessionId: string, versionId: string): StorageLocation => ({
    bucket: "materials",
    path: convertedPdfPath(orgId, sessionId, versionId),
  }),
  materialPage: (orgId: string, sessionId: string, versionId: string, page: number): StorageLocation => ({
    bucket: "material-pages",
    path: materialPagePath(orgId, sessionId, versionId, page),
  }),
  materialPageThumbnail: (orgId: string, sessionId: string, versionId: string, page: number): StorageLocation => ({
    bucket: "material-pages",
    path: materialPageThumbnailPath(orgId, sessionId, versionId, page),
  }),
  photo: (orgId: string, sessionId: string, photoId: string, ext: "jpg" | "png" | "webp" = "webp"): StorageLocation => ({
    bucket: "photos",
    path: photoPath(orgId, sessionId, photoId, ext),
  }),
  designAsset: (orgId: string, assetId: string, ext: "png" | "jpg" | "webp"): StorageLocation => ({
    bucket: "design-assets",
    path: designAssetPath(orgId, assetId, ext),
  }),
  export: (orgId: string, documentId: string, preset: string, ext: string): StorageLocation => ({
    bucket: "exports",
    path: exportPath(orgId, documentId, preset, ext),
  }),
  font: (sha256: string, ext: "woff2" | "ttf"): StorageLocation => ({ bucket: "fonts", path: fontPath(sha256, ext) }),
} as const;
