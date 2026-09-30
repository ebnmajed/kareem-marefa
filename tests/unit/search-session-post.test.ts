import { describe, expect, it } from "vitest";
import { compareSessionPosts, orgDay, postAction, postDay, postExcerpt, postPoints, type PostViewer } from "@/components/browse/session-post";

// Contract 3 of wave 18 — what a session post IS, pure (`DEC-206` §4.45 / §4.57, `DEC-207` §2).

const NOW = new Date("2026-10-01T15:00:00Z"); // 18:00 in Riyadh
const TZ = "Asia/Riyadh";
const hour = 3_600_000;
const at = (h: number) => new Date(NOW.getTime() + h * hour).toISOString();

function candidate(over: Partial<Parameters<typeof postAction>[0]> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    state: "published" as const,
    phase: "open" as const,
    startsAt: at(48),
    endsAt: at(49),
    durationMinutes: 60,
    days: [],
    allowWalkIns: false,
    checkInOpen: false,
    ...over,
  };
}

const viewer = (over: Partial<PostViewer> = {}): PostViewer => ({
  isStaff: false,
  isPresenter: false,
  mine: null,
  waitlistPosition: null,
  checkedInDayIds: [],
  attended: false,
  rating: null,
  ...over,
});

describe("postAction — a feed never reserves; every action is a link (§4.57)", () => {
  it("an open session with a seat → reserve, to the event page", () => {
    expect(postAction(candidate(), "available", viewer(), NOW)).toEqual({ kind: "reserve", href: "/app/sessions/11111111-1111-4111-8111-111111111111" });
  });

  it("a full one → waitlist; a closed one → nothing", () => {
    expect(postAction(candidate(), "full", viewer(), NOW).kind).toBe("waitlist");
    expect(postAction(candidate(), "closed", viewer(), NOW).kind).toBe("none");
  });

  it("a held seat or waitlist place → booked, with the position", () => {
    expect(postAction(candidate(), "available", viewer({ mine: "confirmed" }), NOW)).toMatchObject({ kind: "booked", hold: "seat" });
    expect(postAction(candidate(), "full", viewer({ mine: "waitlisted", waitlistPosition: 3 }), NOW)).toMatchObject({ kind: "booked", hold: "waitlist", waitlistPosition: 3 });
  });

  it("a live session with a confirmed seat → check-in, to SCR-014; once recorded → attended", () => {
    const live = candidate({ state: "in_progress", phase: "live", startsAt: at(-0.5), endsAt: at(0.5), checkInOpen: true });
    expect(postAction(live, "available", viewer({ mine: "confirmed" }), NOW)).toEqual({
      kind: "checkIn",
      href: "/app/sessions/11111111-1111-4111-8111-111111111111/check-in",
      booked: true,
    });
    expect(postAction(live, "available", viewer({ mine: "confirmed", attended: true }), NOW).kind).toBe("attended");
  });

  it("★ the viewer's own session, and a cancelled one, offer nothing (REQ-CHK-011)", () => {
    expect(postAction(candidate(), "available", viewer({ isPresenter: true }), NOW).kind).toBe("none");
    expect(postAction(candidate({ state: "cancelled", phase: "cancelled" }), "available", viewer({ mine: "confirmed" }), NOW).kind).toBe("none");
  });

  it("an ended session → rate only when eligible and not yet rated", () => {
    const ended = candidate({ state: "completed", phase: "ended", startsAt: at(-26), endsAt: at(-25) });
    const closesAt = at(24 * 13);
    expect(postAction(ended, "closed", viewer({ attended: true, rating: { eligible: true, rated: false, closesAt } }), NOW)).toEqual({
      kind: "rate",
      href: "/app/sessions/11111111-1111-4111-8111-111111111111/rate",
      closesAt,
    });
    expect(postAction(ended, "closed", viewer({ attended: true, rating: { eligible: true, rated: true, closesAt } }), NOW).kind).toBe("none");
    expect(postAction(ended, "closed", viewer(), NOW).kind).toBe("none");
  });
});

describe("postPoints — every figure is read (§4.45)", () => {
  it("the rule's figure on an open or live session", () => {
    expect(postPoints(20, "open", false)).toBe(20);
    expect(postPoints(35, "live", false)).toBe(35);
  });
  it("★ nothing — never a 0 — when the rule is off, for the presenter, or once it has ended", () => {
    expect(postPoints(null, "open", false)).toBeNull();
    expect(postPoints(0, "open", false)).toBeNull();
    expect(postPoints(20, "open", true)).toBeNull();
    expect(postPoints(20, "ended", false)).toBeNull();
    expect(postPoints(20, "cancelled", false)).toBeNull();
  });
});

describe("postDay and the feed's order", () => {
  it("a live session stands under today; an ended one under its last day; the rest under their first", () => {
    expect(postDay({ phase: "live", startsAt: at(-50), endsAt: at(2) }, NOW, TZ)).toBe("2026-10-01");
    expect(postDay({ phase: "ended", startsAt: at(-50), endsAt: at(-26) }, NOW, TZ)).toBe("2026-09-30");
    expect(postDay({ phase: "open", startsAt: at(10), endsAt: at(11) }, NOW, TZ)).toBe("2026-10-02");
    expect(postDay({ phase: "open", startsAt: null, endsAt: null }, NOW, TZ)).toBeNull();
  });

  it("the org's wall calendar, not UTC's", () => {
    expect(orgDay(new Date("2026-10-01T22:30:00Z"), TZ)).toBe("2026-10-02");
  });

  it("★ today · coming days ascending · past days descending; committed first within a day, then by start", () => {
    const today = "2026-10-01";
    const p = (day: string | null, startsAt: string, committed = false) => ({ day, startsAt, committed });
    const posts = [
      p("2026-09-29", "2026-09-29T10:00:00Z"),
      p("2026-10-03", "2026-10-03T10:00:00Z"),
      p("2026-10-01", "2026-10-01T12:00:00Z"),
      p("2026-09-30", "2026-09-30T10:00:00Z"),
      p("2026-10-01", "2026-10-01T16:00:00Z", true),
      p("2026-10-02", "2026-10-02T10:00:00Z"),
    ];
    const order = [...posts].sort((a, b) => compareSessionPosts(a, b, today)).map((x) => `${x.day}${x.committed ? "*" : ""}`);
    expect(order).toEqual(["2026-10-01*", "2026-10-01", "2026-10-02", "2026-10-03", "2026-09-30", "2026-09-29"]);
  });
});

describe("postExcerpt", () => {
  it("trims, and says nothing for an empty abstract", () => {
    expect(postExcerpt("  نبذة  ")).toBe("نبذة");
    expect(postExcerpt("   ")).toBeNull();
    expect(postExcerpt(null)).toBeNull();
  });
});
