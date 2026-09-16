// SCR-062's filters, at the data (`lib/dal/admin-audit.ts`) — REQ-ADM-018's
// «searchable by … date range», in the org's own days.
//
// The defect this replaces: «إلى تاريخ 17 سبتمبر» compared `occurred_at <=
// '2026-09-17'`, which is midnight UTC — the day it named was excluded, and
// both bounds were UTC midnights rather than the org's.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));

const { addDays, auditFiltersFrom, dayStartInZone, periodBounds, todayInZone } = await import("@/lib/dal/admin-audit");

describe("dayStartInZone", () => {
  it("a day in Riyadh (UTC+3) starts at 21:00 UTC the day before", () => {
    expect(dayStartInZone("2026-09-17", "Asia/Riyadh")).toBe("2026-09-16T21:00:00.000Z");
  });

  it("reads the offset AT that day — New York before and after its March change", () => {
    expect(dayStartInZone("2026-03-07", "America/New_York")).toBe("2026-03-07T05:00:00.000Z");
    expect(dayStartInZone("2026-03-09", "America/New_York")).toBe("2026-03-09T04:00:00.000Z");
  });

  it("UTC is UTC", () => {
    expect(dayStartInZone("2026-01-01", "UTC")).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("periodBounds — half-open, in the org's days", () => {
  // 2026-09-17 01:30 in Riyadh is still 2026-09-16 in UTC: «today» is the org's.
  const now = new Date("2026-09-16T22:30:00Z");

  it("today is the org's date, not the server's", () => {
    expect(todayInZone("Asia/Riyadh", now)).toBe("2026-09-17");
    expect(todayInZone("UTC", now)).toBe("2026-09-16");
  });

  it("«آخر سبعة أيام» is today and the six before it", () => {
    expect(periodBounds({ period: "7d" }, "Asia/Riyadh", now)).toEqual({ from: "2026-09-10T21:00:00.000Z" });
  });

  it("«هذا الشهر» starts on the first, in the org's zone", () => {
    expect(periodBounds({ period: "month" }, "Asia/Riyadh", now)).toEqual({ from: "2026-08-31T21:00:00.000Z" });
  });

  it("★ a custom range INCLUDES the day it ends on", () => {
    expect(periodBounds({ period: "custom", from: "2026-09-01", to: "2026-09-17" }, "Asia/Riyadh", now)).toEqual({
      from: "2026-08-31T21:00:00.000Z",
      until: "2026-09-17T21:00:00.000Z",
    });
  });

  it("an inverted range applies no dates at all", () => {
    expect(periodBounds({ period: "custom", from: "2026-09-17", to: "2026-09-01" }, "Asia/Riyadh", now)).toEqual({});
  });

  it("dates without `period=custom` are ignored", () => {
    expect(periodBounds({ from: "2026-09-01", to: "2026-09-17" }, "Asia/Riyadh", now)).toEqual({});
  });
});

describe("auditFiltersFrom — a stale or hand-edited link shows the log, not an error", () => {
  it("keeps what parses and drops the rest", () => {
    const { filters, rangeInverted } = auditFiltersFrom({
      actor: "not-a-uuid",
      action: "member.role_changed",
      subject: "member",
      subjectId: "11111111-1111-4111-8111-111111111111",
      period: "fortnight",
      from: "17/09/2026",
      before: "2026-09-17T10:00:00.123456+00:00~22222222-2222-4222-8222-222222222222",
    });
    expect(filters).toEqual({
      action: "member.role_changed",
      subjectType: "member",
      subjectId: "11111111-1111-4111-8111-111111111111",
      before: "2026-09-17T10:00:00.123456+00:00~22222222-2222-4222-8222-222222222222",
    });
    expect(rangeInverted).toBe(false);
  });

  it("«system» is an actor, and an inverted custom range is reported", () => {
    const { filters, rangeInverted } = auditFiltersFrom({ actor: "system", period: "custom", from: "2026-09-17", to: "2026-09-01" });
    expect(filters.actor).toBe("system");
    expect(rangeInverted).toBe(true);
  });

  it("addDays crosses months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
