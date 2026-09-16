// REQ-INT-006, DEC-124 — numerals are Western on every surface, always, and
// there is no setting. ICU's `#` inside a plural formats with the LOCALE's
// numbering system (Arabic-Indic for `ar`), so a catalogue string with `#`
// prints exactly the digits the owner forbade. Every plural selects on
// `count` and prints a pre-formatted `{value}` from `formatNumber()`
// (`@/components/sessions/numerals`). platform's finding at wave 4
// (DEC-056), generalised from its own namespace to all of them: five
// strings across three earlier tracks had it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src", "messages");

function* strings(value: unknown, path: string[]): Generator<[string, string]> {
  if (typeof value === "string") yield [path.join("."), value];
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) yield* strings(v, [...path, k]);
}

/** The plural blocks of a message, nested braces balanced. */
function pluralBlocks(message: string): string[] {
  const out: string[] = [];
  const re = /\{\s*[a-zA-Z_]+\s*,\s*plural\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < message.length && depth > 0; i++) {
      if (message[i] === "{") depth++;
      else if (message[i] === "}") depth--;
    }
    out.push(message.slice(m.index, i));
  }
  return out;
}

describe("every plural prints a pre-formatted {value}, never ICU's #", () => {
  for (const locale of ["ar", "en"]) {
    for (const file of readdirSync(join(ROOT, locale)).filter((f) => f.endsWith(".json"))) {
      it(`${locale}/${file}`, () => {
        const json = JSON.parse(readFileSync(join(ROOT, locale, file), "utf8")) as unknown;
        const offenders = [...strings(json, [])].filter(([, v]) => pluralBlocks(v).some((b) => b.includes("#"))).map(([k]) => k);
        expect(offenders, "plurals using # — format the number with formatNumber() and pass {value}").toEqual([]);
      });
    }
  }
});

// REQ-INT-006's own acceptance: no Arabic-Indic digit anywhere in the
// catalogue. Removing the org setting cannot catch a digit TYPED into a
// translation string, and that is how the rule comes back (DEC-124, DEC-132).
describe("no message carries an Arabic-Indic digit — U+0660–U+0669 or U+06F0–U+06F9", () => {
  for (const locale of ["ar", "en"]) {
    for (const file of readdirSync(join(ROOT, locale)).filter((f) => f.endsWith(".json"))) {
      it(`${locale}/${file}`, () => {
        const json = JSON.parse(readFileSync(join(ROOT, locale, file), "utf8")) as unknown;
        const offenders = [...strings(json, [])].filter(([, v]) => /[\u0660-\u0669\u06F0-\u06F9]/.test(v)).map(([k]) => k);
        expect(offenders, "Arabic-Indic digits — numerals are Western everywhere (DEC-124)").toEqual([]);
      });
    }
  }
});
