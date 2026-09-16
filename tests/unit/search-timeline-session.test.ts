import { describe, expect, it } from "vitest";
import {
  finishTimelineSession,
  groupPresenters,
  groupTags,
  toTimelineCandidate,
  type CandidateContext,
} from "@/components/browse/timeline-session";

// One card, two readers — the timeline and the member's saved sessions
// (REQ-UIX-021, REQ-DSC-006). These pin the row → card derivation both share,
// so a saved session and the same session on the timeline cannot disagree.

const NOW = new Date("2026-09-16T09:00:00Z");

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "s1",
  title: "كيف اختصرنا وقت التقارير",
  state: "published",
  level: "intermediate",
  language: "ar",
  category_id: "c1",
  venue_id: null,
  starts_at: "2026-09-20T15:00:00Z",
  ends_at: "2026-09-20T16:00:00Z",
  duration_minutes: 60,
  time_zone: null,
  capacity: 40,
  rsvp_deadline_at: "2026-09-17T09:00:00Z",
  allow_walk_ins: false,
  check_in_open: true,
  custom_venue_name: "قاعة المؤتمرات",
  categories: { name: "فني" },
  venues: null,
  ...over,
});

const ctx = (over: Partial<CandidateContext> = {}): CandidateContext => ({
  presentersBySession: groupPresenters([{ session_id: "s1", member_id: "m1" }], new Map([["m1", { displayName: "سعد الحربي", companyId: "co1" }]])),
  tagsBySession: groupTags([
    { session_id: "s1", tags: { label: "تقارير", normalised: "تقارير" } },
    { session_id: "s1", tags: { label: "أتمتة", normalised: "اتمته" } },
    { session_id: "s1", tags: null },
  ]),
  mine: new Map(),
  bookmarked: new Set(["s1"]),
  orgTimeZone: "Asia/Riyadh",
  now: NOW,
  ...over,
});

const extras = { confirmedCount: 12, waitlistCount: 0, posterUrl: null, attended: false };

describe("toTimelineCandidate", () => {
  it("derives the phase from the clock and falls back to the org's zone and the one-off venue", () => {
    const c = toTimelineCandidate(row(), ctx());
    expect(c.phase).toBe("open");
    expect(c.timeZone).toBe("Asia/Riyadh");
    expect(c.venueName).toBe("قاعة المؤتمرات");
    expect(c.categoryName).toBe("فني");
    expect(c.bookmarked).toBe(true);
  });

  it("keeps a presenter's company for the filters but not on the card's presenter list", () => {
    const c = toTimelineCandidate(row(), ctx());
    expect(c.presenters).toEqual([{ memberId: "m1", displayName: "سعد الحربي" }]);
    expect(c.presenterCompanyIds).toEqual(["co1"]);
  });

  it("sorts tags in Arabic order and skips a join row whose tag is not visible", () => {
    const c = toTimelineCandidate(row(), ctx());
    expect(c.tags.map((t) => t.label)).toEqual(["أتمتة", "تقارير"]);
  });

  it("reads an ended session as ended once its end has passed, whatever the stored state", () => {
    const c = toTimelineCandidate(row({ starts_at: "2026-09-10T15:00:00Z", ends_at: "2026-09-10T16:00:00Z" }), ctx());
    expect(c.phase).toBe("ended");
  });
});

describe("finishTimelineSession", () => {
  it("computes the seat line from the counts it is handed", () => {
    const open = finishTimelineSession(toTimelineCandidate(row(), ctx()), extras, NOW);
    expect(open.seat).toBe("available");
    expect(open.closingSoon).toBe(true);
    const full = finishTimelineSession(toTimelineCandidate(row(), ctx()), { ...extras, confirmedCount: 40 }, NOW);
    expect(full.seat).toBe("full");
  });

  it("offers check-in to a confirmed seat while the window is open and the room's switch is on (contract 2)", () => {
    const live = row({ state: "in_progress", starts_at: "2026-09-16T08:30:00Z", ends_at: "2026-09-16T10:00:00Z" });
    const confirmed = ctx({ mine: new Map([["s1", "confirmed"]]) });
    expect(finishTimelineSession(toTimelineCandidate(live, confirmed), extras, NOW).canCheckIn).toBe(true);
    expect(finishTimelineSession(toTimelineCandidate(live, ctx()), extras, NOW).canCheckIn).toBe(false);
    // ★ The room closed check-in by hand: no button, whatever the clock says.
    expect(finishTimelineSession(toTimelineCandidate({ ...live, check_in_open: false }, confirmed), extras, NOW).canCheckIn).toBe(false);
    // DEC-141: the window is the clock's now, not the phase job's — a published
    // session whose start has passed admits, as `check_in()` does (0084).
    const clockLive = row({ starts_at: "2026-09-16T08:30:00Z", ends_at: "2026-09-16T10:00:00Z" });
    expect(finishTimelineSession(toTimelineCandidate(clockLive, confirmed), extras, NOW).canCheckIn).toBe(true);
    // Before the start, never.
    expect(finishTimelineSession(toTimelineCandidate(row(), confirmed), extras, NOW).canCheckIn).toBe(false);
  });

  it("carries attendance and the poster through unchanged", () => {
    const card = finishTimelineSession(toTimelineCandidate(row(), ctx()), { ...extras, attended: true, posterUrl: "https://x/p.png" }, NOW);
    expect(card.attended).toBe(true);
    expect(card.posterUrl).toBe("https://x/p.png");
  });
});
