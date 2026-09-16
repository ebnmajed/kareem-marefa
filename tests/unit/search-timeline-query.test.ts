import { describe, expect, it } from "vitest";
import {
  chipEntries,
  getFilter,
  isFiltered,
  parseTimelineQuery,
  timelineHref,
  withFilter,
  withoutFilter,
} from "@/components/browse/timeline-query";

// The timeline's URL contract — REQ-UIX-022, REQ-DSC-005, DEC-130.

const CAT = "11111111-2222-3333-4444-555555555555";
const VENUE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("parseTimelineQuery", () => {
  it("reads every filter the timeline knows, from a Next searchParams object or URLSearchParams alike", () => {
    const fromObject = parseTimelineQuery({ category: CAT, tag: "تقارير", status: "live" });
    const fromParams = parseTimelineQuery(new URLSearchParams(`category=${CAT}&tag=${encodeURIComponent("تقارير")}&status=live`));
    expect(fromObject.entries).toEqual([
      ["category", CAT],
      ["tag", "تقارير"],
      ["status", "live"],
    ]);
    expect(fromParams).toEqual(fromObject);
  });

  it("★ drops an invalid value instead of echoing it into a chip", () => {
    const query = parseTimelineQuery({ category: "abc", venue: VENUE, status: "soon", level: "expert", language: "fr", from: "2026-13-45x", to: "2026-09-30" });
    expect(query.entries).toEqual([
      ["venue", VENUE],
      ["to", "2026-09-30"],
    ]);
  });

  it("reads a period, and drops one that is not the timeline's (DEC-141 ruling 15)", () => {
    expect(parseTimelineQuery({ when: "nextWeek" }).entries).toEqual([["when", "nextWeek"]]);
    expect(parseTimelineQuery({ when: "later" }).entries).toEqual([]);
    expect(parseTimelineQuery({ when: "live" }).entries).toEqual([]);
  });

  it("ignores keys that are not filters, and blank values", () => {
    expect(parseTimelineQuery({ page: "2", q: "  ", utm_source: "x" }).entries).toEqual([]);
  });

  it("keeps the last of a repeated key, as the most recent", () => {
    const query = parseTimelineQuery(new URLSearchParams(`tag=أ&category=${CAT}&tag=ب`));
    expect(query.entries).toEqual([
      ["category", CAT],
      ["tag", "ب"],
    ]);
  });
});

describe("applying and removing", () => {
  const base = parseTimelineQuery({ category: CAT, tag: "تقارير", venue: VENUE });

  it("★ removing one filter never clears the others (REQ-UIX-022)", () => {
    const next = withoutFilter(base, "tag");
    expect(next.entries).toEqual([
      ["category", CAT],
      ["venue", VENUE],
    ]);
  });

  it("★ applying a filter makes it the most recent, replacing its old value", () => {
    const next = withFilter(base, "category", VENUE);
    expect(next.entries.at(-1)).toEqual(["category", VENUE]);
    expect(next.entries.filter(([k]) => k === "category")).toHaveLength(1);
  });

  it("refuses to apply an invalid value, and drops the old one with it", () => {
    expect(getFilter(withFilter(base, "category", "nope"), "category")).toBeUndefined();
  });

  it("row B carries every active filter except the row-A toggles", () => {
    const withStatus = withFilter(base, "status", "ended");
    expect(chipEntries(withStatus).map(([k]) => k)).toEqual(["tag", "venue"]);
  });
});

describe("timelineHref", () => {
  it("★ always addresses /app/sessions — a filter applied on /app lands on the canonical URL (DEC-130)", () => {
    expect(timelineHref(parseTimelineQuery({}))).toBe("/app/sessions");
    expect(timelineHref(parseTimelineQuery({ status: "live" }))).toBe("/app/sessions?status=live");
  });

  it("round-trips, order included", () => {
    const query = parseTimelineQuery(new URLSearchParams(`tag=${encodeURIComponent("إكسل")}&category=${CAT}`));
    const again = parseTimelineQuery(new URLSearchParams(timelineHref(query).split("?")[1]));
    expect(again).toEqual(query);
    expect(isFiltered(again)).toBe(true);
  });
});
