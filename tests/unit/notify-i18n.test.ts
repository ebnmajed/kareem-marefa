// The numeral rule, for the two catalogues this track owns — REQ-INT-006,
// A30, 10 §4.
//
// "Numerals follow the org setting, consistently across UI, email, templates
// and exports." A digit typed straight into a message is frozen in whichever
// system the author happened to use, so an org set the other way shows two
// systems on one screen.
//
// This is not hypothetical. The reminder screen shipped with its three
// defaults typed in Arabic-Indic digits directly under an input holding
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
    // bug in a quieter form since DEC-124: with one digit system there is no
    // mismatch to see, but a count typed into prose cannot be pluralised —
    // it belongs in `{value}` from `formatNumber()`.
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

describe("★ `ar` and `en` carry the same keys — the gate this wave did without", () => {
  // `messages-namespaces.test.ts` proves no leaf is claimed by two namespaces
  // and that every namespace has its Arabic file. Nothing proves the two
  // locales agree, and `notifications` gained keys in six separate commits
  // this wave — parity held by care rather than by a gate, which is the state
  // a gate exists to replace.
  //
  // A key present in `ar` and missing in `en` renders the raw dotted path to
  // an English reader; one present in `en` and missing in `ar` is a string
  // that was never written in Arabic first, which invariant 10 forbids.
  for (const namespace of ["notifications", "calendar"]) {
    it(`${namespace}: neither locale has a key the other lacks`, () => {
      const ar = read(`ar/${namespace}.json`).map(([path]) => path);
      const en = read(`en/${namespace}.json`).map(([path]) => path);
      expect(ar.filter((key) => !en.includes(key)), `missing from en/${namespace}.json`).toEqual([]);
      expect(en.filter((key) => !ar.includes(key)), `missing from ar/${namespace}.json`).toEqual([]);
    });

    it(`${namespace}: no value is an empty string in either locale`, () => {
      // A blank is how a key survives a parity check while showing nothing —
      // the one failure the comparison above cannot see.
      for (const locale of ["ar", "en"]) {
        const blank = read(`${locale}/${namespace}.json`).filter(([, value]) => value.trim() === "").map(([path]) => path);
        expect(blank, `${locale}/${namespace}.json`).toEqual([]);
      }
    });
  }
});
