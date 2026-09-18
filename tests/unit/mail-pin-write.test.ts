// N1's writer — it produces `tests/unit/mail-pinned/`, and it is SKIPPED
// unless `MAIL_PIN_WRITE=1`.
//
// ★ WHY THE WRITER IS A SEPARATE FILE FROM THE TEST, AND WHY IT HAS NO FLAG.
// Pinned mail output is never auto-refreshed (`DEC-160` §4): a changed file is
// a reviewed change, exactly as a shaping golden is. The ways that promise
// usually dies are a `--update` flag someone passes out of habit and a test
// that rewrites what it is comparing. Neither exists here:
//
//   1. `MAIL_PIN_WRITE` is set in no npm script, no `package.json` entry, no
//      CI workflow and no hook. `npm test`, the `TaskCompleted` hook and CI all
//      run `mail-pinned.test.ts` and CANNOT run this file. There is no flag to
//      pass by habit because there is no flag.
//   2. This file asserts nothing. Nothing that fails can be made to pass by
//      running it.
//   3. `mail-pinned.test.ts` asserts the FILE SET, so an orphan left by a
//      renamed case and a file deleted by hand are both red.
//
// Run it by hand, from the repository root, only when a pinned change is
// intended and about to be read:
//
//     MAIL_PIN_WRITE=1 npx vitest run --project unit tests/unit/mail-pin-write.test.ts
//     git diff -- tests/unit/mail-pinned/        # ← the reviewed change
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { renderEmail } from "@kareem/mail-runtime";
import { BRAND, CASES, MEMBER, ORG, PART_SUFFIXES } from "./mail-pinned.fixtures";

const DIR = join(process.cwd(), "tests", "unit", "mail-pinned");

describe.runIf(process.env.MAIL_PIN_WRITE === "1")("write the pinned mail", () => {
  it(`renders ${CASES.length} cases from the renderer as it stands`, () => {
    mkdirSync(DIR, { recursive: true });
    // Clear only what this writer produces, so a renamed case leaves no orphan
    // and nothing outside the four suffixes is ever removed.
    for (const name of readdirSync(DIR)) {
      if (PART_SUFFIXES.some((suffix) => name.endsWith(suffix))) rmSync(join(DIR, name));
    }

    for (const sample of CASES) {
      const input = { key: sample.key, payload: sample.payload, member: sample.member ?? MEMBER, org: ORG };
      const branded = renderEmail({ ...input, brand: BRAND });
      const plain = renderEmail({ ...input, brand: null });
      writeFileSync(join(DIR, `${sample.id}.subject.txt`), branded.subject, "utf8");
      writeFileSync(join(DIR, `${sample.id}.txt`), branded.text, "utf8");
      writeFileSync(join(DIR, `${sample.id}.brand.html`), branded.html, "utf8");
      writeFileSync(join(DIR, `${sample.id}.plain.html`), plain.html, "utf8");
    }
  });
});
