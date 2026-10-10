// A member's profile picture — our copy of it, never Google's (DEC-099, DEC-180 §3,
// DEC-182; REQ-PRF-008, REQ-PRF-011, REQ-NFR-014). The `platform` track's shape.
//
// `avatars/{org_id}/members/{member_id}/{version}/{96|192}.webp`
//
// ★ ORG FIRST, like every other shape here, so `assert_storage_prefixes` covers
// these objects the day they exist and `delete_org` removes them with the org.
// `avatars_storage_read` (0157) reads segments [1]–[4]: the org, the literal
// `members`, the member, and the version — and admits only the member's CURRENT
// version, so a decline or an anonymisation stops the read in the same
// statement that clears the version, before the job deletes a byte.
//
// ★ THE VERSION IS IN THE PATH. It is the copy's epoch milliseconds, so it never
// repeats: a member who declines and later accepts never reuses a URL a browser
// cached as immutable. No original is kept — the 192 px derivative is the
// largest copy of a face the platform holds.
//
// ★ Wave 29 (DEC-280 §2, DEC-281): a member's own upload lands first in
// `avatar-staging/{org_id}/members/{member_id}/{upload_id}` — the same three
// leading segments, so `avatar_staging_insert` (0222) reads [1]–[3] exactly as
// the read policy does, and `delete_org` and the prefix assertion cover it the
// day it exists. No extension: the name never claims a type the worker's sniff
// has not proven. The worker derives, records, and deletes it.
import { assertUuid, InvalidStoragePathError, type StorageLocation } from "./guards.js";

export const AVATAR_SIZES = [96, 192] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];

const VERSION_RE = /^[1-9][0-9]{0,15}$/;

function assertVersion(value: number | string, label: string): string {
  const s = typeof value === "number" ? (Number.isSafeInteger(value) ? String(value) : "") : value;
  if (typeof s !== "string" || !VERSION_RE.test(s)) throw new InvalidStoragePathError(label, String(value));
  return s;
}

function assertAvatarSize(value: number, label: string): AvatarSize {
  if (!(AVATAR_SIZES as readonly number[]).includes(value)) throw new InvalidStoragePathError(label, String(value));
  return value as AvatarSize;
}

/** `{org_id}/members/{member_id}` — every version of one member's picture, for
 *  the job's reconcile (delete what is not current) and for anonymisation. */
export function avatarMemberPrefix(orgId: string, memberId: string): string {
  return [assertUuid(orgId, "orgId"), "members", assertUuid(memberId, "memberId")].join("/");
}

/** `avatars/{org_id}/members/{member_id}/{version}/{size}.webp` */
export function avatarPath(orgId: string, memberId: string, version: number | string, size: AvatarSize): StorageLocation {
  return {
    bucket: "avatars",
    path: [avatarMemberPrefix(orgId, memberId), assertVersion(version, "version"), `${assertAvatarSize(size, "size")}.webp`].join("/"),
  };
}

/** `avatar-staging/{org_id}/members/{member_id}/{upload_id}` — the upload's bytes, until the worker derives them. */
export function avatarStagingPath(orgId: string, memberId: string, uploadId: string): { bucket: "avatar-staging"; path: string } {
  return { bucket: "avatar-staging", path: [avatarMemberPrefix(orgId, memberId), assertUuid(uploadId, "uploadId")].join("/") };
}
