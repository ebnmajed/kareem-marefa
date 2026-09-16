import { arNormalize } from "@/components/browse/ar-normalize";
import { inPeriod, type TimelinePeriod } from "@/components/browse/timeline-groups";
import type { FilterKey, TimelineQuery } from "@/components/browse/timeline-query";
import type { SessionPhase, SessionState } from "@/lib/session-status";

// Whether one session is on the timeline — REQ-UIX-021, REQ-DSC-005,
// REQ-UIX-022. Pure, beside the query it reads, so the DAL applies it over the
// rows it fetched and a unit test proves it without a database.

export interface TimelineMatchable {
  id: string;
  phase: SessionPhase;
  state: SessionState;
  startsAt: string | null;
  mine: "confirmed" | "waitlisted" | null;
  categoryId: string | null;
  venueId: string | null;
  level: string;
  language: string;
  tags: { label: string; normalised: string }[];
  presenters: { memberId: string; displayName: string | null }[];
  presenterCompanyIds: string[];
}

/** The day of an instant in a zone, as `YYYY-MM-DD` — what the date filters compare against. */
function dayIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/**
 * Whether one session passes the query — every filter ANDed, `skip` left out
 * (REQ-DSC-005: filters combine).
 */
export function matchesTimeline(
  c: TimelineMatchable,
  query: TimelineQuery,
  context: { textIds: Set<string> | null; now: Date; orgTimeZone: string; skip?: FilterKey; /** ISO weekday the week starts on — `firstDayOfWeek()`; Sunday by default. */ weekStartsOn?: number },
): boolean {
  const { skip } = context;
  for (const [key, value] of query.entries) {
    if (key === skip) continue;
    switch (key) {
      case "status":
        if (c.phase !== value) return false;
        break;
      case "category":
        if (c.categoryId !== value) return false;
        break;
      case "venue":
        if (c.venueId !== value) return false;
        break;
      case "company":
        if (!c.presenterCompanyIds.includes(value)) return false;
        break;
      case "level":
        if (c.level !== value) return false;
        break;
      case "language":
        if (c.language !== value) return false;
        break;
      case "tag": {
        const wanted = arNormalize(value).toLowerCase();
        if (!c.tags.some((t) => arNormalize(t.normalised).toLowerCase() === wanted)) return false;
        break;
      }
      case "presenter": {
        const needle = arNormalize(value);
        if (!c.presenters.some((p) => p.displayName && arNormalize(p.displayName).includes(needle))) return false;
        break;
      }
      case "when":
        if (!inPeriod(c.startsAt, value as TimelinePeriod, context.now, context.orgTimeZone, context.weekStartsOn)) return false;
        break;
      case "from":
        if (!c.startsAt || dayIn(c.startsAt, context.orgTimeZone) < value) return false;
        break;
      case "to":
        if (!c.startsAt || dayIn(c.startsAt, context.orgTimeZone) > value) return false;
        break;
      case "q":
        if (!context.textIds?.has(c.id)) return false;
        break;
    }
  }
  // No status filter, or it was the one skipped: the default view.
  const statusApplied = query.entries.some(([k]) => k === "status") && skip !== "status";
  if (!statusApplied) {
    const upcoming = c.phase === "open" || c.phase === "live";
    const cancelledForMe = c.state === "cancelled" && c.mine !== null && !!c.startsAt && new Date(c.startsAt).getTime() > context.now.getTime();
    if (!upcoming && !cancelledForMe) return false;
  }
  return true;
}
