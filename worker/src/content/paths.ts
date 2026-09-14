// A port of the four storage path shapes convert_document/render_pages need
// to mint NEW paths (not paths read back from a row). The canonical builder
// is src/lib/storage/paths.ts (03-permissions-rls.md §6: "one server-side
// function" builds every path) — this file exists only because the worker
// is a separate TypeScript project with no import path back into `src/`
// (worker/tsconfig.json has its own rootDir and no path mapping, unlike
// packages/designer-runtime, which the app and the worker image genuinely
// share as one workspace package). Flagged to the lead
// (docs/plan/notes/content.md §3) as an open question — a `packages/
// storage-paths` workspace member is the other way to keep this single in
// fact rather than in name; this port is the one taken until that's decided.
//
// Every shape here MUST match its `src/lib/storage/paths.ts` counterpart
// exactly, byte for byte — both are covered by their own tests
// (tests/unit/storage-paths.test.ts and this file's own test), and a
// mismatch would put an object outside the org prefix its own storage
// policy checks for (the "isolation depends on application correctness"
// weakness 03 §6 names).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

function assertPageNumber(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 100_000) throw new InvalidStoragePathError(label, String(value));
  return value;
}

function assertSafeSegment(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64 || !SAFE_SEGMENT_RE.test(value)) {
    throw new InvalidStoragePathError(label, value);
  }
  return value;
}

/** `materials/{org_id}/sessions/{session_id}/materials/{version_id}/converted.pdf` */
export function convertedPdfPath(orgId: string, sessionId: string, versionId: string): string {
  return [assertUuid(orgId, "orgId"), "sessions", assertUuid(sessionId, "sessionId"), "materials", assertUuid(versionId, "versionId"), "converted.pdf"].join(
    "/",
  );
}

/** `material-pages/{org_id}/sessions/{session_id}/pages/{version_id}/{n}.webp` */
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

/** `material-pages/{org_id}/sessions/{session_id}/pages/{version_id}/thumbs/{n}.webp` */
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

/** `photos/{org_id}/sessions/{session_id}/photos/{photo_id}.{ext}` — process_photo.ts re-uploads
 *  the stripped bytes to the SAME path the browser's raw upload used (07 §9.2, DEC-047); it never
 *  needs a second, different path, so this is only ever called with the extension the app already
 *  picked at initiate time. */
export function photoPath(orgId: string, sessionId: string, photoId: string, ext: "jpg" | "png" | "webp" = "webp"): string {
  return [
    assertUuid(orgId, "orgId"),
    "sessions",
    assertUuid(sessionId, "sessionId"),
    "photos",
    `${assertUuid(photoId, "photoId")}.${assertSafeSegment(ext, "ext")}`,
  ].join("/");
}
