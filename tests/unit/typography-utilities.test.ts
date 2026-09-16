import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ★★ THE GATE FOR A CLASS OF BUG NOTHING ELSE IN THIS PROJECT CAN SEE — DEC-108.
//
// `text-body-sm` was used in **123 files** and defined nowhere. There is no
// `@utility text-body-sm` in `globals.css` and no `--text-*` theme key for
// Tailwind v4 to generate one from, so it emitted NOTHING: every hint, caption,
// error message and meta line using it rendered at inherited body size — 17 px
// on mobile in Arabic — where its author meant 15 px. Since M0.
//
// Nothing could catch it. A missing utility is not a type error, not a lint
// error and not a test failure; the class reads as real in every file that uses
// it, and it is one letter from `text-body-lg`, which does exist. It took a
// teammate adopting the *correct* token and noticing their own text was
// visibly smaller than the screens around it.
//
// So: every house `text-*` class used anywhere under `src/` must have a
// definition in `globals.css`. This is cheap — two file reads and a regex —
// and it is the only thing standing between the next invented token and
// another 123 files.

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

/** The `@utility <name> {` blocks `globals.css` declares. */
const declared = new Set([...CSS.matchAll(/^@utility\s+([a-z0-9-]+)\s*\{/gm)].map((m) => m[1]));

/**
 * Tailwind's own `text-*` utilities, which need no `@utility` block: the colour
 * scale (from `@theme`'s `--color-*`), the alignment and transform keywords,
 * and the numeric/arbitrary sizes. Anything NOT in here is a house token and
 * must be declared.
 */
const TAILWIND_TEXT = new Set([
  "left", "right", "center", "justify", "start", "end",
  "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip",
  "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl",
]);

/** Colour families registered in `@theme`, so `text-fg-muted` etc. are real. */
const COLOUR_PREFIXES = [...CSS.matchAll(/^\s*--color-([a-z0-9-]+):/gm)].map((m) => m[1]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(tsx|ts)$/.test(entry)) yield full;
  }
}

/** Every `text-<name>` token that appears in a class-ish string literal. */
function usedTextClasses(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of walk(join(ROOT, "src"))) {
    const text = readFileSync(file, "utf8");
    // ★ `[` is NOT an allowed lead-in and a trailing `:` disqualifies the
    // match: `[text-indent:-1.25rem]` is Tailwind v4's arbitrary-PROPERTY
    // syntax, which emits real CSS and is not a utility at all. The first
    // version of this test flagged it, which is the right kind of false
    // positive to find — it means the regex was reading class strings the way
    // Tailwind does, one case short.
    for (const m of text.matchAll(/(?:^|[\s"'`(])(?:(?:hover|focus|focus-visible|active|disabled|group-hover|rtl|ltr|md|sm|lg|xl|dark|motion-safe|motion-reduce):)*text-([a-z][a-z0-9-]*)(?![a-z0-9-]*:)/g)) {
      const name = m[1];
      if (!used.has(name)) used.set(name, []);
      const files = used.get(name)!;
      if (files.length < 4 && !files.includes(file)) files.push(file);
    }
  }
  return used;
}

const isColour = (name: string) =>
  COLOUR_PREFIXES.some((c) => name === c || name.startsWith(`${c}-`)) ||
  /^(fg|navy|silver|slate|error|success|live|ended|canvas|surface|edge|spine|node|white|black|transparent|current|inherit)(-|$)/.test(name);

describe("every house text-* utility used in src/ is actually defined (DEC-108)", () => {
  const used = usedTextClasses();

  it("declares the house typography ramp", () => {
    // If one of these ever disappears, the test below would pass vacuously.
    for (const t of ["text-body", "text-body-lg", "text-body-sm", "text-caption", "text-label", "text-h1", "text-h2"]) {
      expect(declared, `${t} must be an @utility in globals.css`).toContain(t);
    }
  });

  it("★ no file uses a text-* class that emits nothing", () => {
    const orphans: string[] = [];
    for (const [name, files] of used) {
      if (TAILWIND_TEXT.has(name)) continue;
      if (isColour(name)) continue;
      if (declared.has(`text-${name}`)) continue;
      orphans.push(`text-${name} — used in ${files.length}+ files, e.g. ${files[0].replace(`${ROOT}/`, "")}`);
    }
    expect(orphans, `undefined typography utilities:\n  ${orphans.join("\n  ")}`).toEqual([]);
  });

  it("★ text-body-sm specifically, because it was dead in 123 files since M0", () => {
    expect(declared).toContain("text-body-sm");
    // And it must be the CAPTION ramp, not the body one — the whole point is
    // that these callers wanted the smaller size.
    const block = CSS.match(/@utility text-body-sm \{([^}]*)\}/)?.[1] ?? "";
    expect(block).toContain("--fs-caption");
    expect(block).toContain("--lh-caption");
  });
});
