// The numeral rule, for the four catalogues this track owns — REQ-INT-006,
// A30, 10 §4. Adopted from tests/unit/notify-i18n.test.ts (the `notify`
// track's own twenty-line version) rather than re-derived, per the lead's
// instruction at wave-2 sync 8.
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

describe("REQ-INT-006 — no numeral system is frozen into the copy (materials/photos/tasks/search)", () => {
  const arabic = [...read("ar/materials.json"), ...read("ar/photos.json"), ...read("ar/tasks.json"), ...read("ar/search.json")];

  it("read all four catalogues", () => {
    expect(arabic.length).toBeGreaterThan(60);
  });

  it("contains no literal Arabic-Indic digit — a number is a parameter", () => {
    const offenders = arabic.filter(([, value]) => ARABIC_INDIC.test(value)).map(([path, value]) => `${path}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it("contains no literal Western digit outside ICU syntax either", () => {
    const offenders = arabic
      .filter(([, value]) => WESTERN.test(value.replace(/=\d+\s*\{/g, "")))
      .map(([path, value]) => `${path}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it("bidi-isolates every interpolated value, so a Latin name cannot reorder an Arabic sentence", () => {
    const offenders: string[] = [];
    for (const [path, value] of arabic) {
      if (value.includes(", plural,")) continue; // the count is a number, not bidi-sensitive text
      const bare = value.replace(/<bdi>\{[\w.]+\}<\/bdi>/g, "");
      if (/\{[\w.]+\}/.test(bare)) offenders.push(`${path}: ${value}`);
    }
    expect(offenders).toEqual([]);
  });
});
