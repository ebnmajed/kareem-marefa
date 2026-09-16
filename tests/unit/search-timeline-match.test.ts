import { describe, expect, it } from "vitest";
import { matchesTimeline } from "@/components/browse/timeline-match";
import { parseTimelineQuery } from "@/components/browse/timeline-query";

// What the timeline shows — REQ-UIX-021 ("what a member can attend"),
// REQ-DSC-005 ("filters combine"), REQ-UIX-022 (drop one, keep the rest).

const NOW = new Date("2026-09-16T09:00:00Z");
const CAT = "11111111-2222-3333-4444-555555555555";
const VENUE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const COMPANY = "99999999-8888-7777-6666-555555555555";

type Row = Parameters<typeof matchesTimeline>[0];
const row = (over: Partial<Row> = {}): Row => ({
  id: "s1",
  phase: "open",
  state: "published",
  startsAt: "2026-09-20T15:00:00Z",
  mine: null,
  categoryId: CAT,
  venueId: VENUE,
  level: "introductory",
  language: "ar",
  tags: [{ label: "تقارير", normalised: "تقارير" }],
  presenters: [{ memberId: "m1", displayName: "سعد الحربي" }],
  presenterCompanyIds: [COMPANY],
  ...over,
});
const ctx = { textIds: null, now: NOW, orgTimeZone: "Asia/Riyadh" };
const none = parseTimelineQuery({});

describe("matchesTimeline — the default view", () => {
  it("shows what is running and what is coming", () => {
    expect(matchesTimeline(row({ phase: "open" }), none, ctx)).toBe(true);
    expect(matchesTimeline(row({ phase: "live" }), none, ctx)).toBe(true);
  });

  it("does not show what has ended, unless asked for", () => {
    expect(matchesTimeline(row({ phase: "ended", state: "completed" }), none, ctx)).toBe(false);
    expect(matchesTimeline(row({ phase: "ended", state: "completed" }), parseTimelineQuery({ status: "ended" }), ctx)).toBe(true);
  });

  it("★ shows a cancelled future session only to a member who holds a seat on it — so they learn it was cancelled", () => {
    const cancelled = row({ phase: "cancelled", state: "cancelled" });
    expect(matchesTimeline(cancelled, none, ctx)).toBe(false);
    expect(matchesTimeline({ ...cancelled, mine: "confirmed" }, none, ctx)).toBe(true);
    expect(matchesTimeline({ ...cancelled, mine: "confirmed", startsAt: "2026-09-01T15:00:00Z" }, none, ctx)).toBe(false);
  });
});

describe("matchesTimeline — filters combine", () => {
  it("ANDs every filter", () => {
    const q = parseTimelineQuery({ category: CAT, venue: VENUE, tag: "تقارير", level: "introductory", language: "ar", company: COMPANY });
    expect(matchesTimeline(row(), q, ctx)).toBe(true);
    expect(matchesTimeline(row({ level: "advanced" }), q, ctx)).toBe(false);
  });

  it("matches a presenter and a tag through Arabic normalisation (REQ-DSC-004)", () => {
    expect(matchesTimeline(row(), parseTimelineQuery({ presenter: "سعد" }), ctx)).toBe(true);
    expect(matchesTimeline(row({ tags: [{ label: "إدارة", normalised: "اداره" }] }), parseTimelineQuery({ tag: "إدارة" }), ctx)).toBe(true);
  });

  it("compares the date filters against the day in the org's zone", () => {
    // 2026-09-19 22:30 UTC is already the 20th in Riyadh.
    const late = row({ startsAt: "2026-09-19T22:30:00Z" });
    expect(matchesTimeline(late, parseTimelineQuery({ from: "2026-09-20" }), ctx)).toBe(true);
    expect(matchesTimeline(late, parseTimelineQuery({ to: "2026-09-19" }), ctx)).toBe(false);
  });

  it("matches a period on the org's calendar, and a period is not a date range", () => {
    // Wednesday 16 September 2026 in Riyadh; the week starts on Sunday the 13th.
    const nextWeek = row({ startsAt: "2026-09-21T15:00:00Z" });
    expect(matchesTimeline(nextWeek, parseTimelineQuery({ when: "nextWeek" }), { ...ctx, weekStartsOn: 7 })).toBe(true);
    expect(matchesTimeline(nextWeek, parseTimelineQuery({ when: "thisWeek" }), { ...ctx, weekStartsOn: 7 })).toBe(false);
    expect(matchesTimeline(nextWeek, parseTimelineQuery({ when: "thisMonth" }), { ...ctx, weekStartsOn: 7 })).toBe(true);
  });

  it("the free-text search is the SQL id set", () => {
    const q = parseTimelineQuery({ q: "تقارير" });
    expect(matchesTimeline(row(), q, { ...ctx, textIds: new Set(["s1"]) })).toBe(true);
    expect(matchesTimeline(row(), q, { ...ctx, textIds: new Set(["other"]) })).toBe(false);
  });

  it("★ skipping one filter keeps every other one — the filtered-empty count", () => {
    const q = parseTimelineQuery({ category: CAT, venue: "ffffffff-ffff-ffff-ffff-ffffffffffff" });
    expect(matchesTimeline(row(), q, ctx)).toBe(false);
    expect(matchesTimeline(row(), q, { ...ctx, skip: "venue" })).toBe(true);
    expect(matchesTimeline(row({ categoryId: null }), q, { ...ctx, skip: "venue" })).toBe(false);
  });
});
