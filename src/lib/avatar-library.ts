// The avatar library — fifty keys in two sets (REQ-PRF-014, DEC-280).
//
// ★ The one list. `0221`'s check constraint and `random_avatar_key()` carry the same fifty in the same order, and
// `tests/unit/avatar-library.test.ts` holds the three — this file, the migration and `public/avatars/` — equal.
// Adding an avatar is a file, a row in `docs/design/assets/avatars/README.md`, a migration and a DEC; a held key is
// never retired. The names are the picker's accessible names and live in `messages/*/avatars.json`.

export const AVATAR_SETS = ["characters", "objects"] as const;
export type AvatarSet = (typeof AVATAR_SETS)[number];

export const AVATAR_KEYS = [
  "characters/director",
  "characters/dop",
  "characters/sound",
  "characters/gaffer",
  "characters/makeup",
  "characters/wardrobe",
  "characters/editor",
  "characters/producer",
  "characters/script",
  "characters/actor",
  "characters/actress",
  "characters/runner",
  "characters/vfx",
  "characters/colorist",
  "characters/writer",
  "characters/scout",
  "characters/broadcast",
  "characters/casting",
  "characters/photographer",
  "characters/drone-pilot",
  "characters/animator",
  "characters/line-producer",
  "characters/host",
  "characters/critic",
  "characters/stylist",
  "objects/clapper",
  "objects/megaphone",
  "objects/film-camera",
  "objects/boom",
  "objects/light",
  "objects/scissors",
  "objects/hanger",
  "objects/dress-form",
  "objects/director-chair",
  "objects/reel",
  "objects/headphones",
  "objects/brush",
  "objects/storyboard",
  "objects/tape",
  "objects/audition",
  "objects/timecode",
  "objects/tripod",
  "objects/lav",
  "objects/gels",
  "objects/drone",
  "objects/monitor",
  "objects/spool",
  "objects/mirror",
  "objects/location",
  "objects/walkie",
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

const KEYS: ReadonlySet<string> = new Set(AVATAR_KEYS);

export function isAvatarKey(value: unknown): value is AvatarKey {
  return typeof value === "string" && KEYS.has(value);
}

/** `/avatars/<set>/<key>.svg` — a shipped, same-origin asset; never a member's upload (invariant 11). */
export function avatarLibrarySrc(key: AvatarKey): string {
  return `/avatars/${key}.svg`;
}

/** The message key of an avatar's name: `characters/drone-pilot` → `characters.drone-pilot`. */
export function avatarNameKey(key: AvatarKey): string {
  return key.replace("/", ".");
}
