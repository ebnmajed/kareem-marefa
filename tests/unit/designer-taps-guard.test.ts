// The SC 2.5.7 gates use taps alone — DEC-093, REQ-DSG-028. A Playwright case that drags, moves a mouse or presses a
// key proves nothing about the single-pointer path, so the two tap specs may never use one (wave 23).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ★ wave 28 (REQ-DSG-036): the three answers of the leave dialog, and the save, are proven on taps too.
const SPECS = ["tests/e2e/wave23-designer-taps.spec.ts", "tests/e2e/wave13-designer-studio-taps.spec.ts", "tests/e2e/wave28-designer-save.spec.ts"];
const FORBIDDEN = /\.(?:dragTo|dragAndDrop|hover|tap|press|dispatchEvent)\(|\bmouse\.|\bkeyboard\.|\btouchscreen\./;

describe("the tap specs never drag, move a mouse or press a key", () => {
  it.each(SPECS)("%s", (path) => {
    const source = readFileSync(path, "utf8");
    const offending = source.split("\n").filter((line) => !line.trim().startsWith("//") && FORBIDDEN.test(line));
    expect(offending).toEqual([]);
    expect(source).toMatch(/\.click\(/);
  });
});
