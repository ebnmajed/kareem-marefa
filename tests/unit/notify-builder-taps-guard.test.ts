// The email builder's SC 2.5.7 gate uses taps alone — DEC-093, REQ-UIX-112, DEC-238 §4. A Playwright case that drags,
// moves a mouse or presses a key proves nothing about the single-pointer path, so the tap spec may never use one.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SPEC = "tests/e2e/wave23-notify-builder-taps.spec.ts";
const FORBIDDEN = /\.(?:dragTo|dragAndDrop|hover|tap|press|dispatchEvent)\(|\bmouse\.|\bkeyboard\.|\btouchscreen\./;

describe("the builder's tap spec never drags, moves a mouse or presses a key", () => {
  it(SPEC, () => {
    const source = readFileSync(SPEC, "utf8");
    const offending = source.split("\n").filter((line) => !line.trim().startsWith("//") && FORBIDDEN.test(line));
    expect(offending).toEqual([]);
    // And it performs the taps it claims: arming, placing, ▲, «انقل», duplicate, delete, save.
    for (const name of ["رمز QR", "أضف في آخر البريد", "عمودان، الثاني أعرض", "انقل لأعلى", "انقل", "كرّر", "احذف", "احفظ وفعّل"]) expect(source, name).toContain(`"${name}"`);
    expect(source).toMatch(/\.click\(/);
  });
});
