// Contract 9, enforced rather than remembered (DEC-150, DEC-157).
//
// `sessionPhase()` reads the night between two days of a workshop as `open`
// ONLY when it is given the session's `days`. Given the stored window alone it
// answers `live` from day 1's start to day 3's end — «جارية الآن» for two
// nights — and nothing fails: `days` is optional on `PhaseInput` on purpose, so
// that no one-day caller had to change and no existing test had to be edited.
// The cost of that choice is that an omission is silent. Wave 9's sync 3 found
// four of them by opening a capture: the public card, the event DTO, the
// profile's session list and the RSVP panel — two phases for one request.
//
// So every `sessionPhase(` call site in `src/` must show where its days come
// from, in one of three ways this test can read:
//
//   1 · the argument is an object literal that names `days`;
//   2 · the argument is an identifier declared in the same file as an object
//       literal that names `days`, or a parameter typed `PhaseInput` (a
//       pass-through: the caller's site is the one that is checked);
//   3 · a comment within the three lines above the call reads `phase-days:`
//       and says where the days are, or why this reader has none to give.
//
// A NEW reader fails here until it does one of the three. It is a source
// guard, like `tasks-never-read-by-check-in.test.ts`, and it is deliberately
// textual: the question «did you think about days?» is a question about the
// text.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const SELF = "src/lib/session-status.ts";

/**
 * ★ The shrinking list. Each entry is a call site that does NOT yet show its
 * days, with its owner — found at sync 3 and being fixed. (`lib/dal/rsvp.ts`,
 * `checkin`'s, was the fourth and was fixed before this file was committed.)
 * ★ The owner of a listed file deletes ITS OWN line here in the commit that
 * fixes the site — the lead's written permission, for those lines only. The second test
 * below fails the moment an entry is fixed and still listed, so the list can
 * only get shorter. It ends the wave EMPTY.
 */
const OPEN: Record<string, string> = {
  "src/app/[locale]/s/[id]/page.tsx": "sessions — the public card; needs the day windows from session_public_card()",
  "src/lib/dal/sessions.ts": "sessions — the event DTO's phase and relation",
  "src/app/[locale]/app/members/[id]/page.tsx": "sessions — the profile's session list",
};

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** The text of the first argument of the call that opens at `open` (the index of its `(`). */
function firstArgument(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    } else if (c === "," && depth === 1) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

/** The object literal a `const name = {…}` declares, or null. */
function declaredLiteral(source: string, name: string): string | null {
  const m = new RegExp(`\\b(?:const|let)\\s+${name}\\b[^=;]*=\\s*\\{`).exec(source);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  return null;
}

const NAMES_DAYS = /\bdays\b/;

interface Site {
  file: string;
  line: number;
  shows: boolean;
}

function sites(): Site[] {
  const found: Site[] = [];
  for (const full of walk(SRC)) {
    const file = relative(ROOT, full);
    if (file === SELF) continue;
    const source = readFileSync(full, "utf8");
    const lines = source.split("\n");
    for (const m of source.matchAll(/\bsessionPhase\(/g)) {
      const at = m.index ?? 0;
      const line = source.slice(0, at).split("\n").length;
      const text = lines[line - 1];
      // a mention in a comment or in prose (`sessionPhase()`'s own …) is not a call
      if (/^\s*(\/\/|\*|\/\*)/.test(text) || source[at + m[0].length] === ")") continue;

      const argument = firstArgument(source, at + m[0].length - 1).trim();
      const above = lines.slice(Math.max(0, line - 4), line - 1).join("\n");
      let shows = NAMES_DAYS.test(argument) || /phase-days:/.test(above);
      if (!shows && /^[A-Za-z_$][\w$]*$/.test(argument)) {
        const literal = declaredLiteral(source, argument);
        shows =
          (literal !== null && NAMES_DAYS.test(literal)) ||
          new RegExp(`\\b${argument}\\s*:\\s*PhaseInput\\b`).test(source);
      }
      found.push({ file, line, shows });
    }
  }
  return found;
}

describe("every reader of the session's phase shows where its days come from", () => {
  const all = sites();

  it("finds the readers at all — a guard that matches nothing guards nothing", () => {
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all.map((s) => s.file)).toContain("src/app/[locale]/app/sessions/[id]/page.tsx");
  });

  it("no call site outside the shrinking list reads the phase without days", () => {
    const silent = all.filter((s) => !s.shows && !(s.file in OPEN)).map((s) => `${s.file}:${s.line}`);
    expect(silent, "pass `days`, or write `// phase-days: <where they are>` above the call").toEqual([]);
  });

  it("the shrinking list only shrinks: an entry that is fixed, or gone, must be deleted", () => {
    const stale = Object.keys(OPEN).filter((file) => !all.some((s) => s.file === file && !s.shows));
    expect(stale, "fixed — remove from OPEN").toEqual([]);
  });
});
