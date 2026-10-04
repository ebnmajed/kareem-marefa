// Words for when — the feed's day headings and its items' times (REQ-UIX-055). Pure: the caller passes the
// translator and the org's calendar day. Western digits only (DEC-124): every number is formatted here with
// `formatNumber` and handed to the message as `value`, never as ICU's `#`.
import { formatDate, formatNumber } from "@/components/sessions/numerals";

type T = (key: string, values?: Record<string, string | number>) => string;

const DAY_MS = 86_400_000;

/** Days between two "YYYY-MM-DD" calendar days, `b − a`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** A day heading — «اليوم», «غدًا», «أمس», else the weekday and the date. */
export function dayHeading(day: string, today: string, t: T, locale: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return t("days.today");
  if (diff === 1) return t("days.tomorrow");
  if (diff === -1) return t("days.yesterday");
  return formatDate(`${day}T12:00:00Z`, "UTC", locale);
}

/** When something happened — «قبل 5 دقائق», «قبل ساعتين», «أمس», else the date. For the past only. */
export function timeAgo(at: string, now: Date, day: string, today: string, t: T, locale: string): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(at)) / 60_000));
  if (minutes < 1) return t("ago.now");
  if (minutes < 60) return t("ago.minutes", { count: minutes, value: formatNumber(minutes) });
  const hours = Math.floor(minutes / 60);
  if (day === today) return t("ago.hours", { count: hours, value: formatNumber(hours) });
  if (daysBetween(day, today) === 1) return t("days.yesterday");
  return formatDate(`${day}T12:00:00Z`, "UTC", locale);
}

