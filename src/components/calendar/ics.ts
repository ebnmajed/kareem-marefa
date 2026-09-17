// Building an RFC 5545 calendar file. REQ-CAL-001, 08 §6.1.
//
// ★ THE ARABIC REQUIREMENT, and the reason this is its own module with its own
// test: RFC 5545 folds content lines at **75 OCTETS**, and an Arabic character
// is two octets in UTF-8. Folding by character count produces a file Outlook
// renders as mojibake or refuses outright — and it looks perfect in every
// editor, because the bytes are only wrong on the wire.
//
// Same family as the RFC 2047 subject trap in worker/src/mail/mime.ts, and it
// gets the same treatment: split on characters, measure in octets.
//
// No dependency. `ics` and `ical-generator` both fold by JavaScript string
// length, which is exactly the bug this file exists to avoid.

const CRLF = "\r\n";

/** RFC 5545 §3.1: a content line is at most 75 octets, excluding the CRLF. */
const MAX_OCTETS = 75;

/**
 * Fold one content line.
 *
 * A continuation begins with a single space, which the parser strips — so a
 * continuation line's own budget is 74 octets of content plus that space.
 * Characters are appended one at a time and measured with
 * `Buffer.byteLength`, because the only wrong way to do this is to count
 * characters and hope.
 */
export function foldLine(line: string): string {
  const out: string[] = [];
  let chunk = "";
  let octets = 0;
  let budget = MAX_OCTETS;

  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (octets + size > budget) {
      out.push(chunk);
      chunk = "";
      octets = 0;
      budget = MAX_OCTETS - 1; // the leading space of a continuation line
    }
    chunk += char;
    octets += size;
  }
  out.push(chunk);
  return out.join(`${CRLF} `);
}

/** RFC 5545 §3.3.11. Backslash first, or it escapes the escapes. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** The zone's UTC offset in minutes at a given instant, from the IANA database
 *  Intl already carries — so no table of zones lives in this repository. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/** `20261001T180000` — the wall-clock time in the given zone. */
export function localStamp(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}${get("month")}${get("day")}T${pad(Number(get("hour")) % 24)}${get("minute")}${get("second")}`;
}

export const utcStamp = (at: Date) => at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Whether the zone keeps one offset all year.
 *
 * A full `VTIMEZONE` for a zone with daylight saving needs its transition
 * RULES, which Intl does not expose — so this repository emits a VTIMEZONE
 * only for a fixed-offset zone (A20's Asia/Riyadh is one) and falls back to
 * UTC instants for anything else. A wrong VTIMEZONE is worse than none: it
 * silently shifts the event by an hour for half the year.
 */
export function hasFixedOffset(timeZone: string, year: number): boolean {
  const january = offsetMinutes(new Date(Date.UTC(year, 0, 15)), timeZone);
  const july = offsetMinutes(new Date(Date.UTC(year, 6, 15)), timeZone);
  return january === july;
}

export interface CalendarEventInput {
  uid: string;
  title: string;
  description: string;
  /** ISO instants. */
  startsAt: string;
  endsAt: string;
  timeZone: string;
  location: string | null;
  url: string;
  /** Bumped when the event changes, so a client updates rather than duplicates. */
  sequence?: number;
  cancelled?: boolean;
  now?: Date;
}

/** One meeting inside a calendar. The zone is the file's, not the day's. */
export type CalendarDayInput = Omit<CalendarEventInput, "timeZone" | "now">;

/**
 * The `UID` of one day, and the one rule that decides it.
 *
 * ★ Position 1 carries the SESSION's own identity —
 * `session-{id}@kareem.pp.sa`, exactly what a one-day session has had since
 * M3 — so a client that already holds that event UPDATES it and a member's
 * calendar is never duplicated (contract 2). A later day is suffixed by its
 * position, never by its id: the set of UIDs then depends on nothing but the
 * number of days, so reordering two days rewrites both entries in place
 * instead of orphaning one under an id that has moved.
 *
 * REQ-SES-015, DEC-119, DEC-151.
 */
export function uidForDay(sessionId: string, position: number): string {
  return position <= 1 ? `session-${sessionId}@kareem.pp.sa` : `session-${sessionId}-day-${position}@kareem.pp.sa`;
}

/**
 * One `VEVENT` per meeting in one `VCALENDAR`, UTF-8, CRLF, folded at 75 octets.
 *
 * `DTSTART;TZID=Asia/Riyadh` with an embedded `VTIMEZONE` rather than a
 * floating local time (08 §6.1), so a member in another zone sees the hour
 * the session actually happens. The `VTIMEZONE` is the file's and is written
 * once, from the first meeting — a session's days are all in the org's zone.
 *
 * ★ `buildIcs()` below is a one-element call of this, so a one-day session's
 * file is byte-identical to the one M3 shipped and `tests/unit/ics.test.ts`
 * proves it without being edited (rule 4).
 */
export function buildIcsCalendar(days: readonly CalendarDayInput[], options: { timeZone: string; now?: Date }): string {
  const zone = options.timeZone;
  const now = options.now ?? new Date();
  const first = days[0] ? new Date(days[0].startsAt) : now;
  const fixed = hasFixedOffset(zone, first.getUTCFullYear());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//kareem-marefa//sessions//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  if (fixed) {
    const offset = formatOffset(offsetMinutes(first, zone));
    lines.push(
      "BEGIN:VTIMEZONE",
      `TZID:${zone}`,
      "BEGIN:STANDARD",
      // A fixed-offset zone has no transition; 1970 is the conventional
      // "since forever" DTSTART for one.
      "DTSTART:19700101T000000",
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      `TZNAME:${zone.split("/").pop() ?? zone}`,
      "END:STANDARD",
      "END:VTIMEZONE",
    );
  }

  for (const day of days) {
    const start = new Date(day.startsAt);
    const end = new Date(day.endsAt);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${day.uid}`,
      `DTSTAMP:${utcStamp(now)}`,
      fixed ? `DTSTART;TZID=${zone}:${localStamp(start, zone)}` : `DTSTART:${utcStamp(start)}`,
      fixed ? `DTEND;TZID=${zone}:${localStamp(end, zone)}` : `DTEND:${utcStamp(end)}`,
      `SUMMARY:${escapeText(day.title)}`,
      `DESCRIPTION:${escapeText(day.description)}`,
    );
    if (day.location) lines.push(`LOCATION:${escapeText(day.location)}`);
    lines.push(
      `URL:${escapeText(day.url)}`,
      `SEQUENCE:${day.sequence ?? 0}`,
      `STATUS:${day.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** One meeting — the shape every caller used before days existed. */
export function buildIcs(event: CalendarEventInput): string {
  const { timeZone, now, ...day } = event;
  return buildIcsCalendar([day], { timeZone, now });
}
