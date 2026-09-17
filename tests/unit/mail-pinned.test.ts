// N1 — the 25 messages this product sends, pinned byte for byte
// (`DEC-160` §4, `REQ-NTF-009`, contract 5).
//
// ★ WHAT THIS FILE IS FOR. `REQ-NTF-009` promises that «an org that has not
// touched its templates renders BYTE-IDENTICAL output to before» once the email
// studio lands, and `DEC-081` promises that «the existing golden tests do not
// move». There were no such tests. The other five `mail-*.test.ts` files pin
// fragments — a `dir="rtl"` on every cell, a `line-height:1.7`, one change
// line — and every one of them would stay green while the shell, the greeting,
// the paragraph splitting or the signature changed underneath.
//
// So this compares whole rendered messages, as files, with `toBe()`. It is the
// measure the package move (L3) and the block compiler (N2) are held to, and
// the reason the pin is the wave's FIRST commit rather than its last.
//
// ★ HOW A CHANGE IS MADE. Never by this file, and never automatically —
// `tests/unit/mail-pin-write.test.ts` writes the directory, is skipped unless
// `MAIL_PIN_WRITE=1`, and that variable is set in no script, no workflow and no
// hook. A changed pinned file reaches `main` as a diff somebody read, which is
// the rule `scripts/parity/goldens/**` already lives under.
//
// ★ THE COVERAGE CHAIN, so this file does not re-parse the matrix.
// `mail-render.test.ts` already asserts, against the matrix read out of the
// promoted migration, that `DEFAULT_TEMPLATES` holds a template for every
// message with an email channel and for nothing else. This file asserts that
// every `DEFAULT_TEMPLATES` key is pinned. The two together are «every email
// message of `08` §1 is pinned», without a second copy of the migration parser.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, renderEmail } from "@kareem/mail-runtime";
import { BRAND, CASES, MEMBER, ORG, PART_SUFFIXES } from "./mail-pinned.fixtures";

const DIR = join(process.cwd(), "tests", "unit", "mail-pinned");
const read = (name: string) => readFileSync(join(DIR, name), "utf8");
const render = (sample: (typeof CASES)[number], brand: typeof BRAND | null) =>
  renderEmail({ key: sample.key, payload: sample.payload, member: sample.member ?? MEMBER, org: ORG, brand });

describe("the pinned set covers what the product sends", () => {
  it("every message with an email channel is pinned at least once", () => {
    const pinned = new Set(CASES.map((c) => c.key));
    const missing = Object.keys(DEFAULT_TEMPLATES).filter((key) => !pinned.has(key));
    expect(missing).toEqual([]);
  });

  it("holds exactly the four files of each case — no orphan, nothing deleted", () => {
    const expected = CASES.flatMap((c) => PART_SUFFIXES.map((suffix) => `${c.id}${suffix}`)).sort();
    const onDisk = readdirSync(DIR)
      .filter((name) => PART_SUFFIXES.some((suffix) => name.endsWith(suffix)))
      .sort();
    expect(onDisk).toEqual(expected);
  });

  it("no pinned part carries an Arabic-Indic digit (REQ-INT-006, DEC-124)", () => {
    for (const name of readdirSync(DIR)) {
      expect(read(name), name).not.toMatch(/[٠-٩۰-۹]/);
    }
  });
});

describe("byte for byte, against the renderer as it stands", () => {
  for (const sample of CASES) {
    describe(sample.id, () => {
      it("the subject", () => {
        expect(render(sample, BRAND).subject).toBe(read(`${sample.id}.subject.txt`));
      });

      it("the text alternative", () => {
        expect(render(sample, BRAND).text).toBe(read(`${sample.id}.txt`));
      });

      it("the HTML, with the org's brand", () => {
        expect(render(sample, BRAND).html).toBe(read(`${sample.id}.brand.html`));
      });

      it("the HTML, with no brand at all", () => {
        expect(render(sample, null).html).toBe(read(`${sample.id}.plain.html`));
      });
    });
  }
});

describe("the two parts that are pinned once", () => {
  // `renderEmail()` computes the subject and the text before `toHtml()` and
  // passes `brand` only to `toHtml()`. Pinning them once is correct BECAUSE of
  // that, so the fact is asserted rather than assumed — if it ever stopped
  // being true the pinned set would be silently half a pin.
  it("neither the subject nor the text depends on the brand", () => {
    for (const sample of CASES) {
      const branded = render(sample, BRAND);
      const plain = render(sample, null);
      expect(plain.subject, sample.id).toBe(branded.subject);
      expect(plain.text, sample.id).toBe(branded.text);
    }
  });

  // The other half of the same point: the brand IS read, so the two HTML files
  // of a case are never the same file. A brand that stopped being applied would
  // otherwise pass every assertion above.
  it("the two HTML parts of every case differ", () => {
    for (const sample of CASES) {
      expect(read(`${sample.id}.brand.html`), sample.id).not.toBe(read(`${sample.id}.plain.html`));
    }
  });
});
