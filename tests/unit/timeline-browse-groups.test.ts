import { describe, expect, it } from "vitest";
import { groupBrowse } from "@/components/browse/timeline-groups";

// Browse's groups — wave 18, `Browse.dc.html`, DEC-206 §4.64: this week · next week · this month ·
// later; a live session stands in this week; no live group; empty groups are not returned.

const NOW = new Date("2026-10-01T09:00:00Z"); // a Thursday in Riyadh
const TZ = "Asia/Riyadh";
const at = (iso: string, phase: "open" | "live" = "open") => ({ phase, startsAt: iso, endsAt: iso });

describe("groupBrowse", () => {
  it("puts a live session into «هذا الأسبوع», first as the caller sorted it", () => {
    const groups = groupBrowse([at("2026-09-28T09:00:00Z", "live"), at("2026-10-02T15:00:00Z")], NOW, TZ, 7);
    expect(groups.map((g) => g.key)).toEqual(["thisWeek"]);
    expect(groups[0].items[0].phase).toBe("live");
  });

  it("keeps «لاحقًا» for a session months out, and returns no empty group", () => {
    const groups = groupBrowse([at("2026-10-02T15:00:00Z"), at("2026-10-06T15:00:00Z"), at("2026-10-28T15:00:00Z"), at("2026-12-20T15:00:00Z")], NOW, TZ, 7);
    expect(groups.map((g) => g.key)).toEqual(["thisWeek", "nextWeek", "thisMonth", "later"]);
  });

  it("a session with no time stands in «لاحقًا»", () => {
    expect(groupBrowse([{ phase: "open" as const, startsAt: null, endsAt: null }], NOW, TZ).map((g) => g.key)).toEqual(["later"]);
  });
});
