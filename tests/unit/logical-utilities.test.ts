import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// ★ THE SECOND DEAD-UTILITY CLASS — DEC-133, after DEC-108's `text-body-sm`.
//
// Tailwind 4 spells the logical insets `start-*` and `end-*` (and `inset-x-*`,
// `inset-y-*`). It has no `inset-inline-*` or `inset-block-*` utility, so those
// classes compile to NOTHING, silently — no type error, no lint error, no test
// failure, and they read as correct to anyone who knows the CSS property names.
// Three shell files carried them: the phone tab bar had no inline edges and
// shrink-wrapped instead of spanning the screen, the search glyph had no
// offset, and the toast stack was unanchored. That was the owner's «the icons
// aren't correctly positioned» (DEC-111).

const SRC = join(process.cwd(), "src");
const DEAD = /(?:^|[\s"'`:])-?(inset-(?:inline|block)(?:-start|-end)?-[\w.[\]/-]+)/g;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(tsx?|mdx?)$/.test(name)) yield path;
  }
}

describe("no class uses a logical inset utility Tailwind 4 does not have", () => {
  it("uses start-*/end-* (and inset-x-*/inset-y-*) instead of inset-inline-*/inset-block-*", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      // Comments are stripped first: the fix explains itself by naming the dead
      // class, and a gate that fails its own explanation gets deleted (M9, trap 3).
      const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\x27"`])\/\/.*$/gm, "$1");
      for (const m of text.matchAll(DEAD)) offenders.push(`${relative(SRC, file)}: ${m[1]}`);
    }
    expect(offenders, "Tailwind 4 has no inset-inline-*/inset-block-* utility — these compile to nothing").toEqual([]);
  });
});
