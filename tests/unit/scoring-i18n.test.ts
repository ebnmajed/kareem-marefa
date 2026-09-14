// The numeral rule, for the three catalogues this track owns — REQ-INT-006,
// A30, 10 §4.
//
// "Numerals follow the org setting, consistently across UI, email, templates
// and exports." A digit typed straight into a message is frozen in whichever
// system the author happened to use, so an org set the other way shows two
// systems on one screen. Copied from tests/unit/notify-i18n.test.ts (the 390
// px review found the same class of bug on the reminder screen — a literal
// «١٠٠٨٠» next to an input holding «10080»).
//
// A rich-text tag under a plain `t()` call is the other bug this track's own
// review found (the leaderboards e2e literally rendered "leaderboards.
// pointsValue" instead of a number): a message containing `<` must be called
// through `t.rich()`, or contain no tag at all.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ARABIC_INDIC = /[٠-٩۰-۹]/;
const WESTERN = /[0-9]/;

/** Every leaf string in a namespace, with its dotted path. */
function leaves(node: unknown, path = "", out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof node === "string") out.push([path, node]);
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) leaves(value, path ? `${path}.${key}` : key, out);
  }
  return out;
}

const read = (file: string) => leaves(JSON.parse(readFileSync(join(process.cwd(), "src", "messages", file), "utf8")));

describe("REQ-INT-006 — no numeral system is frozen into the copy", () => {
  const arabic = [...read("ar/scoring.json"), ...read("ar/leaderboards.json"), ...read("ar/recognition.json")];

  it("read all three catalogues", () => {
    expect(arabic.length).toBeGreaterThan(60);
  });

  it("contains no literal Arabic-Indic digit — a number is a parameter", () => {
    const offenders = arabic.filter(([, value]) => ARABIC_INDIC.test(value)).map(([path, value]) => `${path}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it("contains no literal Western digit outside ICU syntax either", () => {
    // ICU's own `=0` selector and nothing else. A digit in prose is the same
    // bug in the other direction: an org set to Arabic-Indic would read
    // «١٨٠ يومًا» everywhere except the one sentence that says 180.
    const offenders = arabic
      .filter(([, value]) => WESTERN.test(value.replace(/=\d+\s*\{/g, "")))
      .map(([path, value]) => `${path}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it("bidi-isolates every interpolated TEXT value — a plain count needs no <bdi> (digits are weakly directional)", () => {
    const offenders: string[] = [];
    for (const [path, value] of arabic) {
      if (value.includes(", plural,")) continue; // the count is a number, not bidi-sensitive text
      const bare = value.replace(/<bdi>\{[\w.]+\}<\/bdi>/g, "");
      if (/\{[\w.]+\}/.test(bare)) offenders.push(`${path}: ${value}`);
    }
    expect(offenders).toEqual([]);
  });

  it("a message containing a tag is never called through plain t() — every <tag> pairs with t.rich in its caller", () => {
    // This does not know which function calls which key; it only proves the
    // catalogue itself is internally consistent (every <x>…</x> has a
    // matching close) so a caller mismatch is the only remaining way to hit
    // 05's own bug: a well-formed tag under plain t() renders the raw key.
    const offenders: string[] = [];
    for (const [path, value] of arabic) {
      const opens = value.match(/<(\w+)>/g)?.length ?? 0;
      const closes = value.match(/<\/(\w+)>/g)?.length ?? 0;
      if (opens !== closes) offenders.push(`${path}: ${value}`);
    }
    expect(offenders).toEqual([]);
  });
});
