// DEC-296 — an admin marks any member at any time; a moderator keeps the window (REQ-CHK-008).
import { describe, expect, it } from "vitest";
import { canMarkManually, manualMarkCandidates } from "@/components/checkin/manual-mark-scope";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const base = { hasDay: true, dayStarted: true, ceiling: NOW + 3_600_000, now: NOW };

describe("canMarkManually", () => {
  it("★ an admin, before the day has begun and long past its ceiling, on any attendable state", () => {
    for (const state of ["published", "in_progress", "completed", "archived"]) {
      expect(canMarkManually({ ...base, isAdmin: true, state, dayStarted: false })).toBe(true);
      expect(canMarkManually({ ...base, isAdmin: true, state, ceiling: NOW - 1 })).toBe(true);
    }
  });

  it("★ never on a session nobody can attend — cancelled, or not yet published — nor with no day", () => {
    for (const state of ["cancelled", "draft", "submitted", "approved"]) expect(canMarkManually({ ...base, isAdmin: true, state })).toBe(false);
    expect(canMarkManually({ ...base, isAdmin: true, state: "published", hasDay: false })).toBe(false);
  });

  it("a moderator only once the day has begun, before its ceiling, never on an archived session", () => {
    expect(canMarkManually({ ...base, isAdmin: false, state: "in_progress" })).toBe(true);
    expect(canMarkManually({ ...base, isAdmin: false, state: "published", dayStarted: false })).toBe(false);
    expect(canMarkManually({ ...base, isAdmin: false, state: "completed", ceiling: NOW })).toBe(false);
    expect(canMarkManually({ ...base, isAdmin: false, state: "archived" })).toBe(false);
  });
});

describe("manualMarkCandidates", () => {
  const listed = [{ value: "seat", label: "صاحب مقعد" }];
  const org = [
    { id: "seat", displayName: "صاحب مقعد", email: "s@x", status: "active" as const },
    { id: "here", displayName: "حاضر", email: "h@x", status: "active" as const },
    { id: "walk", displayName: null, email: "w@x", status: "active" as const },
    { id: "gone", displayName: "موقوف", email: "g@x", status: "deactivated" as const },
  ];

  it("★ an admin's sheet: the seat-holders first, then every other active member not present — no reservation needed", () => {
    expect(manualMarkCandidates(listed, new Set(["here"]), org)).toEqual([
      { value: "seat", label: "صاحب مقعد" },
      { value: "walk", label: "w@x" },
    ]);
  });

  it("a moderator's sheet (no org list): the table's rows alone", () => {
    expect(manualMarkCandidates(listed, new Set(), null)).toEqual(listed);
  });
});
