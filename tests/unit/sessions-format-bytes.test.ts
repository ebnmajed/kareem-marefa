// A file's size in a human unit, in Western digits — REQ-DSG-027, DEC-124.
import { describe, expect, it } from "vitest";
import { formatBytes } from "@/components/sessions/numerals";

const NBSP = " ";

describe("formatBytes", () => {
  it("Arabic: Western digits, a long unit, one decimal under 10", () => {
    expect(formatBytes(1_234_000, "ar")).toBe(`1.2${NBSP}ميغابايت`);
    expect(formatBytes(820_000, "ar")).toBe(`820${NBSP}كيلوبايت`);
    expect(formatBytes(45_600_000, "ar")).toBe(`46${NBSP}ميغابايت`);
  });

  it("never prints an Arabic-Indic digit", () => {
    for (const n of [0, 999, 1_000, 9_999, 123_456_789]) expect(formatBytes(n, "ar")).not.toMatch(/[٠-٩۰-۹]/u);
  });

  it("English: a short unit", () => {
    expect(formatBytes(1_234_000, "en")).toBe(`1.2${NBSP}MB`);
    expect(formatBytes(820_000, "en")).toBe(`820${NBSP}kB`);
  });

  it("the number never breaks from its unit", () => {
    expect(formatBytes(2_000_000, "ar")).not.toMatch(/ /);
  });
});
