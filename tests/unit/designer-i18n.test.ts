// The numeral and bidi rules for this track's catalogues — REQ-INT-006,
// REQ-INT-007, A30, 10 §4. Same guard the notify and scoring tracks run;
// copied deliberately rather than shared, because each track owns its own
// namespace list and a shared file would need editing by three owners.
//
// The designer is where getting this wrong costs most: a numeral frozen into
// a template's copy is printed, and a poster cannot be corrected after it is
// on a wall.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ARABIC_INDIC = /[٠-٩۰-۹]/;
const WESTERN = /[0-9]/;

function leaves(node: unknown, path = "", out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof node === "string") out.push([path, node]);
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) leaves(value, path ? `${path}.${key}` : key, out);
  }
  return out;
}

const NAMESPACES = ["designer", "templates", "certificates"];

const read = (locale: string) =>
  NAMESPACES.flatMap((ns) => {
    const file = join(process.cwd(), "src", "messages", locale, `${ns}.json`);
    // The namespaces land story by story; the guard covers whichever exist.
    return existsSync(file) ? leaves(JSON.parse(readFileSync(file, "utf8"))) : [];
  });

describe("REQ-INT-006 — no numeral system is frozen into the copy", () => {
  const arabic = read("ar");

  it("read at least one Arabic catalogue", () => {
    expect(arabic.length).toBeGreaterThan(20);
  });

  it("contains no literal Arabic-Indic digit — a number is a parameter", () => {
    expect(arabic.filter(([, v]) => ARABIC_INDIC.test(v)).map(([p, v]) => `${p}: ${v}`)).toEqual([]);
  });

  it("contains no literal Western digit outside ICU syntax either", () => {
    const offenders = arabic.filter(([, v]) => WESTERN.test(v.replace(/=\d+\s*\{/g, ""))).map(([p, v]) => `${p}: ${v}`);
    expect(offenders).toEqual([]);
  });
});

describe("REQ-INT-007 — every interpolated value is bidi-isolated", () => {
  it("wraps each text placeholder in <bdi>", () => {
    const offenders: string[] = [];
    for (const [path, value] of read("ar")) {
      if (value.includes(", plural,")) continue; // a count is a number, not bidi-sensitive text
      if (/\{[\w.]+\}/.test(value.replace(/<bdi>\{[\w.]+\}<\/bdi>/g, ""))) offenders.push(`${path}: ${value}`);
    }
    expect(offenders).toEqual([]);
  });

  it("every tag in the catalogue is balanced, so a t.rich caller cannot half-match", () => {
    const offenders: string[] = [];
    for (const [path, value] of [...read("ar"), ...read("en")]) {
      const opens = value.match(/<(\w+)>/g)?.length ?? 0;
      const closes = value.match(/<\/(\w+)>/g)?.length ?? 0;
      if (opens !== closes) offenders.push(`${path}: ${value}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("Arabic is the source (invariant 10)", () => {
  it("every key in the English catalogue exists in the Arabic one", () => {
    const ar = new Set(read("ar").map(([p]) => p));
    const missing = read("en")
      .map(([p]) => p)
      .filter((p) => !ar.has(p));
    expect(missing).toEqual([]);
  });

  it("all six ICU plural forms appear wherever Arabic counts something", () => {
    // Arabic has zero, one, two, few, many and other. A catalogue that stops
    // at one/other reads «2 طبقة» — grammatically wrong in a way no test
    // downstream would catch.
    for (const [path, value] of read("ar")) {
      if (!value.includes(", plural,")) continue;
      for (const form of ["zero", "one", "two", "few", "many", "other"]) {
        expect(value, `${path} is missing the ${form} form`).toContain(`${form} {`);
      }
    }
  });
});
