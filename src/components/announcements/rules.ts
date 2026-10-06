// An org announcement's rules — REQ-ADM-025, DEC-267, 0164 + 0213. Pure, so the DAL, the screen and the tests read
// one copy.
//
// An announcement is NOT a session: it is a short text an admin publishes to the whole org, now or at a time, with an
// optional end. Its status is DERIVED from the two instants, never stored — 0164's read policy draws the same line
// (`published_at <= now() and (expires_at is null or expires_at > now())`), so the screen cannot say «منشور» about a
// row a member's feed does not show.

export const ANNOUNCEMENT_MAX = 500;

export type AnnouncementStatus = "scheduled" | "live" | "ended";

export function announcementStatus(row: { publishedAt: string; expiresAt: string | null }, now: Date = new Date()): AnnouncementStatus {
  const t = now.getTime();
  if (new Date(row.publishedAt).getTime() > t) return "scheduled";
  if (row.expiresAt !== null && new Date(row.expiresAt).getTime() <= t) return "ended";
  return "live";
}

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * A wall clock in `timeZone` («2026-10-07T18:00», the picker's value) as an ISO instant, or `null`. The same `Intl`
 * offset method as the schedule form's (`schedule/rules.ts`), so «6:00 م» means the clock on the org's wall.
 */
export function atZone(local: string, timeZone: string): string | null {
  if (!LOCAL.test(local)) return null;
  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  const shown = new Date(naive.toLocaleString("en-US", { timeZone }));
  const utc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(naive.getTime() - (shown.getTime() - utc.getTime())).toISOString();
}

/** The inverse: an instant as the picker's «YYYY-MM-DDTHH:mm» in `timeZone`, Western digits always (DEC-124). */
export function toLocalInput(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** The same instant to the minute — the picker cannot carry seconds, so re-saving an untouched time keeps the row's. */
export function sameMinute(a: string, b: string): boolean {
  return Math.floor(new Date(a).getTime() / 60_000) === Math.floor(new Date(b).getTime() / 60_000);
}

/** A row's name in a sentence — the first words of its text, never cut inside a word when a space is near. */
export function excerpt(body: string, max = 40): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
