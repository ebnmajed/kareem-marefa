// Wave 29, PR A — the avatar library (DEC-280; REQ-PRF-014, REQ-PRF-015).
//
// ★ Three copies of one list must stay equal: `src/lib/avatar-library.ts`, `0221`'s `avatar_library()`, and the files
// under `public/avatars/`. The README is where the list was drawn; it is held too, so a new row cannot be forgotten.
// ★ The fifty SVGs are shipped assets, not uploads (invariant 11 is about uploads) — and still none may carry a script,
// an event attribute, a foreign object or a reference outside itself.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AVATAR_KEYS, AVATAR_SETS, avatarLibrarySrc, avatarNameKey, isAvatarKey } from "@/lib/avatar-library";
import { avatarHref } from "@/components/privacy/avatar-href";
import ar from "@/messages/ar/avatars.json";
import en from "@/messages/en/avatars.json";

const ROOT = join(__dirname, "..", "..");
const MEMBER = "22222222-2222-4222-8222-222222222222";

function shipped(): string[] {
  return AVATAR_SETS.flatMap((set) =>
    readdirSync(join(ROOT, "public", "avatars", set))
      .filter((f) => f.endsWith(".svg"))
      .map((f) => `${set}/${f.slice(0, -".svg".length)}`),
  ).sort();
}

describe("the library is one list", () => {
  it("holds fifty keys, twenty-five per set, none twice", () => {
    expect(AVATAR_KEYS).toHaveLength(50);
    expect(new Set(AVATAR_KEYS).size).toBe(50);
    for (const set of AVATAR_SETS) expect(AVATAR_KEYS.filter((k) => k.startsWith(`${set}/`))).toHaveLength(25);
  });

  it("equals the files shipped under public/avatars/", () => {
    expect(shipped()).toEqual([...AVATAR_KEYS].sort());
  });

  it("equals 0221's avatar_library(), in order", () => {
    const sql = readFileSync(join(ROOT, "supabase", "migrations", "0221_avatar_library.sql"), "utf8");
    const body = sql.slice(sql.indexOf("create function public.avatar_library()"), sql.indexOf("$fn$;", sql.indexOf("create function public.avatar_library()")));
    expect([...body.matchAll(/'((?:characters|objects)\/[a-z-]+)'/g)].map((m) => m[1])).toEqual([...AVATAR_KEYS]);
  });

  it("equals the README's table, so a new row cannot be forgotten", () => {
    const readme = readFileSync(join(ROOT, "docs", "design", "assets", "avatars", "README.md"), "utf8");
    expect([...readme.matchAll(/\| `((?:characters|objects)\/[a-z-]+)\.svg` \|/g)].map((m) => m[1])).toEqual([...AVATAR_KEYS]);
  });

  it("names every avatar in Arabic and English — and nothing else", () => {
    for (const messages of [ar, en]) {
      const names = messages.avatars.names as Record<string, Record<string, string>>;
      const keys = Object.entries(names).flatMap(([set, byKey]) => Object.keys(byKey).map((k) => `${set}/${k}`));
      expect(keys.sort()).toEqual([...AVATAR_KEYS].sort());
      for (const key of AVATAR_KEYS) {
        const [set, name] = avatarNameKey(key).split(".");
        expect(names[set][name].trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("the SVGs are inert", () => {
  it.each([...AVATAR_KEYS])("%s carries no script, handler, foreign object or outside reference", (key) => {
    const svg = readFileSync(join(ROOT, "public", `${avatarLibrarySrc(key)}`), "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    expect(svg).not.toMatch(/<foreignObject/i);
    expect(svg).not.toMatch(/(?:xlink:)?href\s*=\s*["'](?!#)/i);
    expect(svg).not.toMatch(/url\(\s*["']?(?!#)/i);
    expect(svg).not.toMatch(/<image/i);
  });
});

describe("avatarHref — photo, then the library, then nothing", () => {
  it("a stored copy wins over the key", () => {
    expect(avatarHref({ id: MEMBER, avatarVersion: 7, avatarKey: "objects/reel" })).toBe(`/api/avatars/${MEMBER}?v=7&s=96`);
  });

  it("with no copy, the key's shipped SVG — same-origin, at every size", () => {
    expect(avatarHref({ id: MEMBER, avatarVersion: null, avatarKey: "characters/drone-pilot" })).toBe("/avatars/characters/drone-pilot.svg");
    expect(avatarHref({ id: MEMBER, avatarVersion: null, avatarKey: "objects/reel" }, 192)).toBe("/avatars/objects/reel.svg");
  });

  it("with neither — an anonymised member, or a reader that does not select the key — null, so initials", () => {
    expect(avatarHref({ id: MEMBER, avatarVersion: null, avatarKey: null })).toBeNull();
    expect(avatarHref({ id: MEMBER, avatarVersion: null })).toBeNull();
  });

  it("★ never builds a path from a key outside the library", () => {
    for (const key of ["../secret", "characters/../../x", "characters/nobody", "objects/reel.svg", "https://example.com/a"]) {
      expect(isAvatarKey(key)).toBe(false);
      expect(avatarHref({ id: MEMBER, avatarVersion: null, avatarKey: key })).toBeNull();
    }
  });
});
