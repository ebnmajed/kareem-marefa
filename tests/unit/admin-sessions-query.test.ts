// SCR-042's list state as pure functions (wave 21, REQ-UIX-087, DEC-228 §3.5):
// the URL is the whole state, so what these say is what a reload, a shared
// link and a browser without JS all see.
import { describe, expect, it } from "vitest";
import {
  MONTH_NONE,
  filterSessions,
  isUndated,
  monthKeyOf,
  pageSessions,
  parseSessionQuery,
  sessionsHref,
  sortSessions,
  SESSIONS_PAGE_SIZE,
  type ConsoleSessionRow,
  type SessionQuery,
} from "@/components/admin/sessions/session-query";

const Q: SessionQuery = { q: "", status: null, category: null, month: null, sort: "default", dir: "asc", page: 1 };

let n = 0;
const row = (over: Partial<ConsoleSessionRow>): ConsoleSessionRow => ({
  id: `s${++n}`,
  title: "جلسة",
  state: "published",
  phase: "open",
  seat: "available",
  startsAt: null,
  endsAt: null,
  dayCount: 1,
  venueName: null,
  capacity: 40,
  confirmed: 0,
  waitlisted: 0,
  categoryId: null,
  presenters: [],
  monthKey: null,
  ...over,
});

describe("parseSessionQuery", () => {
  it("reads every param, and anything unrecognised is the default — never an error", () => {
    expect(parseSessionQuery({ q: "  الشبكات ", status: "live", category: "00000000-0000-4000-8000-0000000000c1", month: "2026-10", sort: "seats", dir: "desc", page: "3" })).toEqual({
      q: "الشبكات",
      status: "live",
      category: "00000000-0000-4000-8000-0000000000c1",
      month: "2026-10",
      sort: "seats",
      dir: "desc",
      page: 3,
    });
    expect(parseSessionQuery({ status: "published", category: "x", month: "2026-13", sort: "drop table", page: "-2" })).toEqual(Q);
    expect(parseSessionQuery({ month: MONTH_NONE }).month).toBe(MONTH_NONE);
  });
});

describe("filterSessions", () => {
  const rows = [
    row({ title: "أساسيات الشبكات", presenters: [{ memberId: "m", displayName: "سارة القحطاني", avatarUrl: null, teamColor: null, accepted: true, declinedAt: null }], monthKey: "2026-10", startsAt: "2026-10-04T14:00:00Z" }),
    row({ title: "الأمان السحابي", phase: "live", categoryId: "c1", monthKey: "2026-09", startsAt: "2026-09-04T14:00:00Z" }),
    row({ title: "بلا موعد", state: "approved", phase: "pending_schedule" }),
    row({ title: "ملغاة بلا موعد", state: "cancelled", phase: "cancelled" }),
  ];
  it("searches the title or a presenter's name, normalising the hamza and the taa marbuta", () => {
    expect(filterSessions(rows, { ...Q, q: "الشبكات" }).map((r) => r.title)).toEqual(["أساسيات الشبكات"]);
    expect(filterSessions(rows, { ...Q, q: "سارة" }).map((r) => r.title)).toEqual(["أساسيات الشبكات"]);
    expect(filterSessions(rows, { ...Q, q: "اساسيات" }).map((r) => r.title)).toEqual(["أساسيات الشبكات"]);
  });
  it("narrows by status, category and month", () => {
    expect(filterSessions(rows, { ...Q, status: "live" }).map((r) => r.title)).toEqual(["الأمان السحابي"]);
    expect(filterSessions(rows, { ...Q, category: "c1" }).map((r) => r.title)).toEqual(["الأمان السحابي"]);
    expect(filterSessions(rows, { ...Q, month: "2026-10" }).map((r) => r.title)).toEqual(["أساسيات الشبكات"]);
  });
  it("«بلا موعد» is exactly the dashboard's «جلسات لم تُجدول بعد»: undated, not cancelled or archived", () => {
    expect(filterSessions(rows, { ...Q, month: MONTH_NONE }).map((r) => r.title)).toEqual(["بلا موعد"]);
    expect(isUndated({ startsAt: null, state: "archived" })).toBe(false);
  });
});

describe("sortSessions — the artboard's default order (DEC-228 §3.5)", () => {
  it("live first, then upcoming by date ascending, then undated, then past by date descending", () => {
    const rows = [
      row({ title: "past-old", phase: "ended", startsAt: "2026-09-10T14:00:00Z" }),
      row({ title: "undated", phase: "draft" }),
      row({ title: "upcoming-late", startsAt: "2026-10-07T14:00:00Z" }),
      row({ title: "live", phase: "live", startsAt: "2026-10-01T14:00:00Z" }),
      row({ title: "past-recent", phase: "ended", startsAt: "2026-09-30T14:00:00Z" }),
      row({ title: "upcoming-soon", startsAt: "2026-10-02T14:00:00Z" }),
      row({ title: "cancelled", phase: "cancelled", startsAt: "2026-09-20T14:00:00Z" }),
    ];
    expect(sortSessions(rows, "default", "asc").map((r) => r.title)).toEqual(["live", "upcoming-soon", "upcoming-late", "undated", "past-recent", "cancelled", "past-old"]);
  });
  it("by date, an undated session sorts last in either direction (kept from wave 6)", () => {
    const rows = [row({ title: "b", startsAt: "2026-10-02T00:00:00Z" }), row({ title: "none" }), row({ title: "a", startsAt: "2026-10-01T00:00:00Z" })];
    expect(sortSessions(rows, "start", "asc").map((r) => r.title)).toEqual(["a", "b", "none"]);
    expect(sortSessions(rows, "start", "desc").map((r) => r.title)).toEqual(["b", "a", "none"]);
  });
});

describe("pageSessions and sessionsHref", () => {
  it("pages by the artboard's nine, clamping a page past the end", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ title: `s${String(i).padStart(2, "0")}`, startsAt: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z` }));
    const p2 = pageSessions(rows, { ...Q, page: 2 });
    expect(p2).toMatchObject({ total: 20, page: 2, pageCount: 3, from: SESSIONS_PAGE_SIZE + 1, to: 2 * SESSIONS_PAGE_SIZE });
    expect(pageSessions(rows, { ...Q, page: 99 }).page).toBe(3);
    expect(pageSessions([], Q)).toMatchObject({ total: 0, from: 0, to: 0, pageCount: 1 });
  });
  it("leaves defaults out, so the plain URL is the default list", () => {
    expect(sessionsHref(Q)).toBe("/app/admin/sessions");
    expect(sessionsHref(Q, { month: MONTH_NONE })).toBe("/app/admin/sessions?month=none");
    expect(sessionsHref({ ...Q, q: "شبكات", page: 2 }, { sort: "title", dir: "desc" })).toBe(`/app/admin/sessions?q=${encodeURIComponent("شبكات")}&sort=title&dir=desc&page=2`);
  });
});

describe("monthKeyOf", () => {
  it("reads the month on the org's clock, not UTC's", () => {
    expect(monthKeyOf("2026-09-30T22:30:00Z", "Asia/Riyadh")).toBe("2026-10");
    expect(monthKeyOf("2026-09-30T22:30:00Z", "UTC")).toBe("2026-09");
  });
});
