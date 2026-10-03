// When a console row happened, as the boards draw it: a relative day and the time — «اليوم · 09:41», «أمس · 18:02»,
// «منذ 3 أيام · 10:15» — and past a week the short date. Pure, so the server page and a client table share it; the
// caller passes the server's `now`, so the server and the hydrating client say the same thing. Days are counted in the
// org's time zone (REQ-INT-003). The instant itself goes in `<time datetime>` beside it.

import { formatDate, formatTime } from "@/components/sessions/numerals";

export type RelativeWhen =
  | { kind: "today" | "yesterday"; time: string }
  | { kind: "days"; days: number; time: string }
  | { kind: "date"; date: string; time: string };

/** The calendar day of an instant in a time zone, as a UTC midnight in milliseconds. */
function dayOf(iso: string, timeZone: string): number {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function relativeWhen(iso: string, now: string, timeZone: string, locale = "ar"): RelativeWhen {
  const time = formatTime(iso, timeZone, locale);
  const days = Math.round((dayOf(now, timeZone) - dayOf(iso, timeZone)) / 86_400_000);
  if (days <= 0) return { kind: "today", time };
  if (days === 1) return { kind: "yesterday", time };
  if (days < 7) return { kind: "days", days, time };
  return { kind: "date", date: formatDate(iso, timeZone, locale), time };
}

type Markup = (key: string, values: Record<string, string | number | ((chunks: string) => string)>) => string;

/** The words for a `RelativeWhen`, from a namespace's `when.*` keys — a plain string, its values already isolated by
 *  the caller's element (`<time>`), so the `<bdi>` tags are dropped here. */
export function whenWords(markup: Markup, prefix: string, w: RelativeWhen): string {
  const plain = (chunks: string) => chunks;
  if (w.kind === "days") return markup(`${prefix}.days`, { count: w.days, value: String(w.days), time: w.time, bdi: plain });
  if (w.kind === "date") return markup(`${prefix}.date`, { date: w.date, time: w.time, bdi: plain });
  return markup(`${prefix}.${w.kind}`, { time: w.time, bdi: plain });
}
