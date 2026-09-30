// The home's merge — REQ-UIX-055, STORY-UIX-044, DEC-207 §2. Each item under its own day; the days read
// today · coming ascending · past descending; inside a day posts (committed first), recaps, announcements,
// achievements; ties broken by key, never by a timestamp two rows share.
import { describe, expect, it } from "vitest";
import type { SessionPost } from "@/components/browse/session-post";
import { compareDays, groupFeed, toEntries } from "@/components/feed/feed-merge";
import type { AchievementItem } from "@/lib/dal/recognition";

const TZ = "Asia/Riyadh";
const TODAY = "2026-09-30";

function post(id: string, over: Partial<SessionPost>): SessionPost {
  return { id, title: id, phase: "open", day: TODAY, committed: false, startsAt: `${TODAY}T15:30:00Z`, endsAt: `${TODAY}T17:00:00Z`, ...over } as SessionPost;
}
const member = { memberId: "m", displayName: "فهد", company: null, teamColor: null, isSelf: false };
const badge = (id: string, awardedAt: string): AchievementItem => ({ kind: "badge", id, awardedAt, member, badge: { name: "أول حضور", description: null } });

describe("compareDays", () => {
  it("today, then the coming days ascending, then the past days descending", () => {
    const days = ["2026-09-28", "2026-10-02", TODAY, "2026-09-29", "2026-10-01"];
    expect([...days].sort((a, b) => compareDays(a, b, TODAY))).toEqual([TODAY, "2026-10-01", "2026-10-02", "2026-09-29", "2026-09-28"]);
  });
});

describe("groupFeed", () => {
  it("puts every item under its OWN day — an achievement two hours ago is today's, not the next session's", () => {
    const entries = toEntries(
      {
        posts: [post("live", { phase: "live" }), post("thursday", { day: "2026-10-02", startsAt: "2026-10-02T15:30:00Z" }), post("recap", { phase: "ended", day: "2026-09-29", endsAt: "2026-09-29T17:00:00Z" })],
        achievements: [badge("b1", "2026-09-30T09:00:00Z")],
        announcements: [{ id: "a1", body: "إعلان", publishedAt: "2026-09-29T08:00:00Z" }],
      },
      TZ,
    );
    const groups = groupFeed(entries, TODAY);
    expect(groups.map((g) => g.day)).toEqual([TODAY, "2026-10-02", "2026-09-29"]);
    expect(groups[0]!.entries.map((e) => e.key)).toEqual(["session:live", "badge:b1"]);
    expect(groups[2]!.entries.map((e) => e.key)).toEqual(["recap:recap", "announcement:a1"]);
  });

  it("an ended post is a recap and nothing else; a cancelled one stays a post", () => {
    const entries = toEntries({ posts: [post("e", { phase: "ended" }), post("c", { phase: "cancelled" })], achievements: [], announcements: [] }, TZ);
    expect(entries.map((e) => e.kind).sort()).toEqual(["recap", "session"]);
  });

  it("inside a day, a committed session comes first", () => {
    const entries = toEntries(
      { posts: [post("early", { startsAt: `${TODAY}T10:00:00Z` }), post("mine", { committed: true, startsAt: `${TODAY}T18:00:00Z` })], achievements: [], announcements: [] },
      TZ,
    );
    expect(groupFeed(entries, TODAY)[0]!.entries.map((e) => e.key)).toEqual(["session:mine", "session:early"]);
  });

  it("forty badges one run wrote at one instant keep one order, render after render", () => {
    const at = `${TODAY}T03:00:00Z`;
    const items = Array.from({ length: 40 }, (_, i) => badge(`id-${String(i).padStart(2, "0")}`, at));
    const once = groupFeed(toEntries({ posts: [], achievements: items, announcements: [] }, TZ), TODAY)[0]!.entries.map((e) => e.key);
    const again = groupFeed(toEntries({ posts: [], achievements: [...items].reverse(), announcements: [] }, TZ), TODAY)[0]!.entries.map((e) => e.key);
    expect(again).toEqual(once);
  });

  it("the day is the ORG's calendar: 22:30 UTC on the 29th is the 30th in Riyadh", () => {
    const [group] = groupFeed(toEntries({ posts: [], achievements: [badge("late", "2026-09-29T22:30:00Z")], announcements: [] }, TZ), TODAY);
    expect(group!.day).toBe(TODAY);
  });

  it("a post with no day (unscheduled) is not in the feed", () => {
    expect(toEntries({ posts: [post("x", { day: null })], achievements: [], announcements: [] }, TZ)).toEqual([]);
  });
});
