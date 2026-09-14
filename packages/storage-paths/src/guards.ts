// The segment guards every shape in this package is built from.
//
// Every segment taken from caller-controlled data (org/session/version/photo/
// asset/document ids, filenames, extensions) is validated before it is
// interpolated. A rejected segment throws — callers never receive a path
// built from an unsafe value. Nothing here may be exported to callers except
// the error class and the two shared types: a caller that could assemble its
// own segments would be a second path builder.

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

export function assertUuid(value: string, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new InvalidStoragePathError(label, value);
  return value;
}

export function assertSha256(value: string, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) throw new InvalidStoragePathError(label, value);
  return value.toLowerCase();
}

export function assertPageNumber(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 100_000) throw new InvalidStoragePathError(label, String(value));
  return value;
}

/** A filename kept verbatim in the path (the source upload's own name), sniffed on content — never trusted for anything but display and this one path segment. */
export function assertSafeFilename(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 255 || value === "." || value === ".." || !SAFE_FILENAME_RE.test(value)) {
    throw new InvalidStoragePathError(label, value);
  }
  return value;
}

/** A short, closed-vocabulary segment — an extension or an export preset name. Never free text. */
export function assertSafeSegment(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64 || !SAFE_SEGMENT_RE.test(value)) {
    throw new InvalidStoragePathError(label, value);
  }
  return value;
}

export type Bucket = "materials" | "material-pages" | "photos" | "design-assets" | "exports" | "fonts";

/** The bucket + path pair a caller actually needs to hand to Storage. */
export interface StorageLocation {
  bucket: Bucket;
  path: string;
}
