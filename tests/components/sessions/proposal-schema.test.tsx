// ★ STORY-PRO-001's headline acceptance, as a test rather than as a habit.
//
// REQ-PRO-001: "The proposal form AND ITS VALIDATION SCHEMA contain no date,
// time or venue field." The database half is pinned in tests/rls (no such
// column on `public.proposals`); this is the application half. It fails if
// anybody ever adds one, which is the only way a rule like this survives
// contact with a year of feature requests.
//
// `server-only` is stubbed because the schema's natural home is beside the
// DTOs it validates, in the DAL, and this project is jsdom without the
// `react-server` condition. Nothing else in the module is exercised here.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { proposalInput } = await import("@/lib/dal/proposals");

const FORBIDDEN = [
  "date",
  "time",
  "datetime",
  "startsAt",
  "starts_at",
  "endsAt",
  "ends_at",
  "scheduledAt",
  "when",
  "venue",
  "venueId",
  "venue_id",
  "location",
  "place",
  "room",
  "capacity",
  "seats",
  "rsvpDeadline",
  "rsvpDeadlineAt",
  "cancellationCutoffAt",
  "timeZone",
  "duration",
];

const valid = {
  title: "كيف اختصرنا وقت إعداد التقارير إلى النصف",
  abstract: "تجربة عملية استغرقت ثلاثة أشهر، وما تعلمناه منها.",
  categoryId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  level: "introductory" as const,
  targetAudience: null,
  expectedDurationMinutes: 45,
  adminNotes: null,
};

describe("proposalInput — REQ-PRO-001", () => {
  it("has no schedule-shaped key", () => {
    const keys = Object.keys(proposalInput.shape);
    for (const forbidden of FORBIDDEN) {
      expect(keys, `proposalInput must not carry \`${forbidden}\``).not.toContain(forbidden);
    }
    // `expectedDurationMinutes` is the one duration-ish field REQ-PRO-002
    // allows, and OQ-001 makes it a pre-fill, never authoritative. It is not
    // a schedule: it names a length, not a moment.
    expect(keys).toContain("expectedDurationMinutes");
  });

  it("is exactly the nine fields REQ-PRO-002 lists for this story", () => {
    expect(Object.keys(proposalInput.shape).sort()).toEqual(
      ["abstract", "adminNotes", "categoryId", "expectedDurationMinutes", "level", "targetAudience", "title"].sort(),
    );
  });

  it("rejects a smuggled schedule field rather than dropping it", () => {
    // .strict() is what makes this a failure instead of a silent no-op. A
    // dropped field looks like it worked, which is how a date ends up in a
    // proposal six months later via some other write path.
    for (const key of ["startsAt", "venueId", "capacity"]) {
      const result = proposalInput.safeParse({ ...valid, [key]: "2026-10-01T18:00:00Z" });
      expect(result.success, `\`${key}\` must be rejected`).toBe(false);
    }
  });

  it("accepts a well-formed proposal and trims it", () => {
    const result = proposalInput.safeParse({ ...valid, title: `  ${valid.title}  ` });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe(valid.title);
  });

  it("holds the bounds the table holds, so a violation is a field error and not a 23514", () => {
    expect(proposalInput.safeParse({ ...valid, title: "قص" }).success).toBe(false);
    expect(proposalInput.safeParse({ ...valid, title: "ط".repeat(151) }).success).toBe(false);
    expect(proposalInput.safeParse({ ...valid, abstract: "" }).success).toBe(false);
    expect(proposalInput.safeParse({ ...valid, abstract: "ط".repeat(2001) }).success).toBe(false);
    expect(proposalInput.safeParse({ ...valid, categoryId: "not-a-uuid" }).success).toBe(false);
    expect(proposalInput.safeParse({ ...valid, expectedDurationMinutes: 10 }).success).toBe(false);
    expect(proposalInput.safeParse({ ...valid, expectedDurationMinutes: 481 }).success).toBe(false);
    expect(proposalInput.safeParse({ ...valid, expectedDurationMinutes: null }).success).toBe(true);
  });

  it("does not accept authority from the caller", () => {
    // Validation checks shape, not authority: org and proposer are re-derived
    // from the session inside the DAL, so a well-formed object cannot name a
    // row the caller does not own.
    for (const key of ["orgId", "org_id", "proposerId", "proposer_id", "state", "decisionReason", "decision_reason"]) {
      expect(Object.keys(proposalInput.shape)).not.toContain(key);
      expect(proposalInput.safeParse({ ...valid, [key]: "x" }).success).toBe(false);
    }
  });
});
