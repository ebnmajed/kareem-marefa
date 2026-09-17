// `components/admin/duration.ts` — the reminder schedule's and the scoring
// catalogue's durations, typed as a number and a unit, stored in one base unit.
import { describe, expect, it } from "vitest";
import { parseDuration, splitDuration } from "@/components/admin/duration";

describe("splitDuration", () => {
  const reminderUnits = ["minutes", "hours", "days"] as const;

  it("reads a stored amount in the largest unit that divides it exactly", () => {
    expect(splitDuration(10080, "minutes", reminderUnits)).toEqual({ amount: 7, unit: "days" });
    expect(splitDuration(1440, "minutes", reminderUnits)).toEqual({ amount: 1, unit: "days" });
    expect(splitDuration(120, "minutes", reminderUnits)).toEqual({ amount: 2, unit: "hours" });
    expect(splitDuration(90, "minutes", reminderUnits)).toEqual({ amount: 90, unit: "minutes" });
  });

  it("zero stays in the base unit — it is «at once», not «0 days»", () => {
    expect(splitDuration(0, "minutes", reminderUnits)).toEqual({ amount: 0, unit: "minutes" });
  });

  it("a seconds base: a cooldown of 60 seconds reads one minute, 90 seconds stays seconds", () => {
    const units = ["seconds", "minutes", "hours", "days"] as const;
    expect(splitDuration(60, "seconds", units)).toEqual({ amount: 1, unit: "minutes" });
    expect(splitDuration(90, "seconds", units)).toEqual({ amount: 90, unit: "seconds" });
    expect(splitDuration(86400, "seconds", units)).toEqual({ amount: 1, unit: "days" });
  });
});

describe("parseDuration", () => {
  it("converts to the base unit", () => {
    expect(parseDuration("7", "days", "minutes")).toEqual({ ok: true, amount: 10080 });
    expect(parseDuration(" 2 ", "hours", "minutes")).toEqual({ ok: true, amount: 120 });
    expect(parseDuration("0", "minutes", "minutes")).toEqual({ ok: true, amount: 0 });
    expect(parseDuration("3", "minutes", "seconds")).toEqual({ ok: true, amount: 180 });
  });

  it("an empty box is «required», anything else that is not a whole number is «invalid»", () => {
    expect(parseDuration("", "days", "minutes")).toEqual({ ok: false, error: "required" });
    expect(parseDuration("1.5", "days", "minutes")).toEqual({ ok: false, error: "invalid" });
    expect(parseDuration("-2", "days", "minutes")).toEqual({ ok: false, error: "invalid" });
    expect(parseDuration("5", "weeks", "minutes")).toEqual({ ok: false, error: "invalid" });
    expect(parseDuration("30", "seconds", "minutes")).toEqual({ ok: false, error: "invalid" });
  });

  it("★ DEC-124: an Arabic-Indic digit is refused, never quietly converted", () => {
    expect(parseDuration("\u0667", "days", "minutes")).toEqual({ ok: false, error: "invalid" });
  });
});
