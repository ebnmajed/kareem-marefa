// REQ-INT-006 — numerals follow the ORG setting, consistently, on every
// surface. ICU's `#` inside a plural formats with the LOCALE's numbering
// system (Arabic-Indic for `ar`), so a catalogue string with `#` prints
// ٣ for an org set to western numerals and 3 for one set to Arabic-Indic
// only by accident. Every plural selects on `count` and prints a
// pre-formatted `{value}` the component made with the org's setting
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
        expect(offenders, "plurals using # — format the number with the org's numerals and pass {value}").toEqual([]);
      });
    }
  }
});
