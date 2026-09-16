import type { SessionPhase } from "@/lib/session-status";

// The timeline's date groups — `16` §6.2, REQ-UIX-021, DEC-112.
//
// Time is the axis members navigate by, so the list is grouped by it:
// «جارية الآن» first, then «هذا الأسبوع» · «الأسبوع القادم» · «هذا الشهر» ·
// «لاحقًا» for what is coming, and one group per month for what has ended.
// Empty groups are not returned, so none is ever rendered.
//
// ★ In the ORG's time zone, not the reader's and not the server's: «هذا الأسبوع»
// is the week on the wall of the room. The week starts where the locale says
// it does (`Intl.Locale.getWeekInfo`, Sunday for ar-SA), with Sunday as the
// fallback where the runtime does not answer.
//
// Pure, so the edges — midnight, the week boundary, a month turning inside next
// week — are unit-tested rather than discovered on a Saturday night.

export type UpcomingGroupKey = "live" | "thisWeek" | "nextWeek" | "thisMonth" | "later";

export interface TimelineGroup<T> {
  /** `live` … `later`, or `month:YYYY-MM` for an ended session's month. */
  key: string;
  items: T[];
}

export interface Groupable {
  phase: SessionPhase;
  startsAt: string | null;
  endsAt: string | null;
}

interface LocalDay {
  year: number;
  month: number;
  /** Days since 1970-01-01 of this calendar date — an ordinal, not an instant. */
  ordinal: number;
  /** 1 = Monday … 7 = Sunday, ISO style, to compare with `getWeekInfo().firstDay`. */
  weekday: number;
}

function localDay(date: Date, timeZone: string): LocalDay {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { year, month, ordinal: Math.floor(Date.UTC(year, month - 1, day) / 86_400_000), weekday };
}

export function firstDayOfWeek(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    return l.getWeekInfo?.().firstDay ?? l.weekInfo?.firstDay ?? 7;
  } catch {
    return 7;
  }
}

/** Which upcoming group a session belongs to, or null for a phase that is not upcoming. */
export function upcomingGroupOf(item: Groupable, now: Date, timeZone: string, weekStartsOn = 7): UpcomingGroupKey | null {
  if (item.phase === "live") return "live";
  if (!item.startsAt) return "later";
  const today = localDay(now, timeZone);
  const day = localDay(new Date(item.startsAt), timeZone);
  const weekStart = today.ordinal - ((today.weekday - weekStartsOn + 7) % 7);
  if (day.ordinal < weekStart + 7) return "thisWeek";
  if (day.ordinal < weekStart + 14) return "nextWeek";
  if (day.year === today.year && day.month === today.month) return "thisMonth";
  return "later";
}

const UPCOMING_ORDER: UpcomingGroupKey[] = ["live", "thisWeek", "nextWeek", "thisMonth", "later"];

/** Upcoming sessions, already sorted by the caller, into the non-empty groups in order. */
export function groupUpcoming<T extends Groupable>(items: T[], now: Date, timeZone: string, weekStartsOn = 7): TimelineGroup<T>[] {
  const buckets = new Map<UpcomingGroupKey, T[]>();
  for (const item of items) {
    const key = upcomingGroupOf(item, now, timeZone, weekStartsOn) ?? "later";
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return UPCOMING_ORDER.filter((key) => buckets.has(key)).map((key) => ({ key, items: buckets.get(key)! }));
}

/** Ended sessions, most recent first, one group per calendar month of their end. */
export function groupEnded<T extends Groupable>(items: T[], timeZone: string): TimelineGroup<T>[] {
  const groups: TimelineGroup<T>[] = [];
  for (const item of items) {
    const at = item.endsAt ?? item.startsAt;
    const key = at
      ? (() => {
          const d = localDay(new Date(at), timeZone);
          return `month:${d.year}-${String(d.month).padStart(2, "0")}`;
        })()
      : "month:unknown";
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

/** «سبتمبر 2026» for a `month:YYYY-MM` key, in Western digits. */
export function monthLabel(key: string, locale: string): string | null {
  const match = /^month:(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 15)));
}
