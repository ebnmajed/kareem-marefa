// The numeral rule, for the two catalogues this track owns — REQ-INT-006,
// A30, 10 §4.
//
// "Numerals follow the org setting, consistently across UI, email, templates
// and exports." A digit typed straight into a message is frozen in whichever
// system the author happened to use, so an org set the other way shows two
// systems on one screen.
//
// This is not hypothetical. The reminder screen shipped with «الافتراضي
// ١٠٠٨٠ و١٤٤٠ و١٢٠» in Arabic-Indic directly under an input holding
// «10080, 1440, 120» in Western — two systems, three centimetres apart, on a
// screen whose entire subject is those three numbers. The 390 px review
// caught it; this is what catches the next one.
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
  const arabic = [...read("ar/notifications.json"), ...read("ar/calendar.json")];

  it("read both catalogues", () => {
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

  it("bidi-isolates every interpolated value, so a Latin name cannot reorder an Arabic sentence", () => {
    // A placeholder that is not inside <bdi> and is not an ICU plural's own
    // count argument. 10 §3: every interpolated value is isolated.
    const offenders: string[] = [];
    for (const [path, value] of arabic) {
      if (value.includes(", plural,")) continue; // the count is a number, not bidi-sensitive text
      const bare = value.replace(/<bdi>\{[\w.]+\}<\/bdi>/g, "");
      if (/\{[\w.]+\}/.test(bare)) offenders.push(`${path}: ${value}`);
    }
    expect(offenders).toEqual([]);
  });
});
