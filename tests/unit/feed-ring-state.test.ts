// The ring row — REQ-UIX-055, DEC-206 §1.5, DEC-207 §6.5. 24 hours either side of a day; never a cancelled
// session; never `seen`; live · upcoming soonest · recap latest.
import { describe, expect, it } from "vitest";
import type { SessionPost } from "@/components/browse/session-post";
import { feedRings, ringFor, ringGlyph } from "@/components/feed/ring-state";

const TZ = "Asia/Riyadh";
const NOW = new Date("2026-09-30T12:00:00Z");
const H = 3_600_000;
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

function post(id: string, phase: SessionPost["phase"], startMs: number, endMs: number, days: SessionPost["days"] = []): SessionPost {
  return { id, title: `جلسة ${id}`, phase, startsAt: at(startMs), endsAt: at(endMs), days, presenters: [] } as unknown as SessionPost;
}

describe("ringFor", () => {
  it("a live session is live", () => expect(ringFor(post("a", "live", -H, H), NOW, TZ)?.state).toBe("live"));
  it("an open session starting within 24 h is upcoming", () => expect(ringFor(post("a", "open", 23 * H, 25 * H), NOW, TZ)?.state).toBe("upcoming"));
  it("an open session starting in 25 h has no ring — the artboard's «بعد 3 أيام» ring is outside the window", () => expect(ringFor(post("a", "open", 25 * H, 26 * H), NOW, TZ)).toBeNull());
  it("an ended session within 24 h of its end is a recap", () => expect(ringFor(post("a", "ended", -5 * H, -3 * H), NOW, TZ)?.state).toBe("recap"));
  it("an ended session past 24 h has no ring", () => expect(ringFor(post("a", "ended", -30 * H, -25 * H), NOW, TZ)).toBeNull());
  it("a cancelled session never has one, even inside the window", () => expect(ringFor(post("a", "cancelled", 2 * H, 3 * H), NOW, TZ)).toBeNull());
  it("each day of a workshop has its own window: between two days, the next one within 24 h is upcoming", () => {
    const days = [
      { id: "d1", position: 1, startsAt: at(-26 * H), endsAt: at(-24.5 * H), checkInOpen: false },
      { id: "d2", position: 2, startsAt: at(20 * H), endsAt: at(22 * H), checkInOpen: false },
    ];
    expect(ringFor(post("w", "open", -26 * H, 22 * H, days), NOW, TZ)?.state).toBe("upcoming");
  });
});

describe("feedRings", () => {
  it("orders live, then upcoming soonest first, then recap latest first — and never draws `seen`", () => {
    const rings = feedRings(
      [post("r-old", "ended", -20 * H, -19 * H), post("u-late", "open", 20 * H, 21 * H), post("live", "live", -H, H), post("u-soon", "open", 2 * H, 3 * H), post("r-new", "ended", -3 * H, -2 * H)],
      NOW,
      TZ,
    );
    expect(rings.map((r) => r.sessionId)).toEqual(["live", "u-soon", "u-late", "r-new", "r-old"]);
    expect(rings.map((r) => r.state)).not.toContain("seen");
  });
});

describe("ringGlyph", () => {
  it("the company's first letter, «ال» set aside", () => expect(ringGlyph("الصنف", "x")).toBe("ص"));
  it("the title's when there is no company", () => expect(ringGlyph(null, "لوحة تحكم")).toBe("ل"));
});
