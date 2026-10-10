// Contract 4 (DEC-180, DEC-182) — the ONE shape of an avatar's URL.
//
// Every DTO that carries a member's picture carries `avatarUrl: string | null`,
// and that string is only ever what this function returns: a same-origin path
// to `/api/avatars/{memberId}`, which serves OUR copy from OUR storage. It is
// never `members.avatar_url` — that column is Google's source, and drawing it
// would disclose every viewer to Google on every render (DEC-099).
//
// ★ Wave 29 (DEC-280, REQ-PRF-015): photo → library avatar → initials. With no
// readable copy and a library key held, it returns the shipped SVG,
// `/avatars/<set>/<key>.svg` — same-origin, never a member's upload. `null`
// only when neither exists (an anonymised member), so `<Avatar>` draws the
// initials (REQ-PRF-009) rather than an image that could only 404.
//
// Pure and free of `server-only` on purpose: the realtime comment list builds
// an author's href in the browser from the payload's `authorAvatarVersion`, and
// SQL never builds this string — one shape, one builder. `src/lib/dal/avatars.ts`
// re-exports it for the server readers.

import { avatarLibrarySrc, isAvatarKey } from "@/lib/avatar-library";

export type AvatarSize = 96 | 192;

// ★ Was `AvatarSource` until wave 29; renamed so it cannot be confused with `members.avatar_source` (DEC-280).
export interface AvatarMember {
  id: string;
  /** `members.avatar_version` — the copy's epoch milliseconds, or null for none. */
  avatarVersion: number | string | null | undefined;
  /** `members.avatar_key` — the library avatar held, `<set>/<key>`. Optional: a reader that omits it draws initials. */
  avatarKey?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^[1-9][0-9]{0,15}$/;

/** Our copy at `/api/avatars/{id}?v={version}&s={size}`, else the library SVG, else null. */
export function avatarHref(member: AvatarMember, size: AvatarSize = 96): string | null {
  return photoHref(member, size) ?? libraryHref(member.avatarKey);
}

function photoHref({ id, avatarVersion }: AvatarMember, size: AvatarSize): string | null {
  if (avatarVersion === null || avatarVersion === undefined) return null;
  const version = String(avatarVersion);
  if (!UUID_RE.test(id) || !VERSION_RE.test(version)) return null;
  return `/api/avatars/${id.toLowerCase()}?v=${version}&s=${size}`;
}

function libraryHref(key: string | null | undefined): string | null {
  return isAvatarKey(key) ? avatarLibrarySrc(key) : null;
}
