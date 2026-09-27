// Contract 4 (DEC-180, DEC-182) — the ONE shape of an avatar's URL.
//
// Every DTO that carries a member's picture carries `avatarUrl: string | null`,
// and that string is only ever what this function returns: a same-origin path
// to `/api/avatars/{memberId}`, which serves OUR copy from OUR storage. It is
// never `members.avatar_url` — that column is Google's source, and drawing it
// would disclose every viewer to Google on every render (DEC-099).
//
// `null` whenever there is no readable copy, so `<Avatar>` draws the initials
// (REQ-PRF-009) rather than an image that could only 404.
//
// Pure and free of `server-only` on purpose: the realtime comment list builds
// an author's href in the browser from the payload's `authorAvatarVersion`, and
// SQL never builds this string — one shape, one builder. `src/lib/dal/avatars.ts`
// re-exports it for the server readers.

export type AvatarSize = 96 | 192;

export interface AvatarSource {
  id: string;
  /** `members.avatar_version` — the copy's epoch milliseconds, or null for none. */
  avatarVersion: number | string | null | undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^[1-9][0-9]{0,15}$/;

/** `/api/avatars/{id}?v={version}&s={size}`, or null when there is no readable copy. */
export function avatarHref(member: AvatarSource, size: AvatarSize = 96): string | null {
  const { id, avatarVersion } = member;
  if (avatarVersion === null || avatarVersion === undefined) return null;
  const version = String(avatarVersion);
  if (!UUID_RE.test(id) || !VERSION_RE.test(version)) return null;
  return `/api/avatars/${id.toLowerCase()}?v=${version}&s=${size}`;
}
