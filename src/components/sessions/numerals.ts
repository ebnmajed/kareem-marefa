// Numerals are Western, everywhere, always (REQ-INT-006, DEC-124).
//
// There is no setting. An org cannot choose Arabic-Indic digits, a member
// cannot, and the platform cannot — the owner's rule, stated absolutely:
// «Never use the indian numerals anywhere». So the numbering system is named
// explicitly here, `latn`, rather than inherited from `ar`, whose CLDR default
// is `arab`: an `Intl` formatter built on the bare locale would quietly print
// Arabic-Indic digits in an Arabic interface, which is exactly what this module
// exists to keep out.
//
// The same rule holds in the designer runtime's binding formatters and the
// worker's mail renderer, so a poster, an email and the event page all print
// the same digits for the same date.

const numberFormat = new Intl.NumberFormat("ar-u-nu-latn");

/** A number, in Western digits. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** U+00A0. */
const NBSP = "\u00A0";

/**
 * ★ A TIME NEVER BREAKS FROM ITS «م».
 *
 * `Intl` separates the clock from the day period with a plain space in Arabic
 * («6:57 م») and U+202F in English. A plain space is a line-break opportunity, so
 * on a narrow line «6:57» ended one line and «م» began the next — seen on the
 * public card's capture and on the member's calendar in wave 7, and patched once
 * before per page (`28e1a2b`). The fix belongs here, where every surface gets its
 * time: the whitespace beside the day period becomes a no-break space, and
 * nothing else in the string changes. `tests/unit/sessions-numerals.test.ts`
 * pins the character.
 */
function joined(parts: Intl.DateTimeFormatPart[]): string {
  return parts
    .map((part, i) =>
      part.type === "literal" && /^\s+$/u.test(part.value) && (parts[i + 1]?.type === "dayPeriod" || parts[i - 1]?.type === "dayPeriod") ? NBSP : part.value,
    )
    .join("");
}

/**
 * A date and time, in Western digits and the org's time zone (REQ-INT-003,
 * REQ-INT-006, OQ-018).
 *
 * The time zone is the org's, not the reader's: a session happens in a room,
 * and «6:00 م» has to mean the clock on that room's wall whoever is looking.
 */
export function formatDateTime(iso: string, timeZone: string, locale = "ar"): string {
  return joined(
    new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone,
    }).formatToParts(new Date(iso)),
  );
}

/**
 * A clock time alone, in Western digits and the org's time zone.
 *
 * A session that starts and ends on the same day should read «… 6:00 م ·
 * حتى 7:00 م», not repeat the whole date twice. `sameDay()` decides which,
 * comparing the two instants **in the session's zone** rather than the
 * server's, or a session late in the evening in Riyadh would look like two
 * days to a process running in UTC.
 */
export function formatTime(iso: string, timeZone: string, locale = "ar"): string {
  return joined(
    new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
      timeStyle: "short",
      timeZone,
    }).formatToParts(new Date(iso)),
  );
}

/**
 * A day alone — «الاثنين، 15 سبتمبر» — in Western digits and the given zone.
 *
 * For a sentence that names a day and not a moment: the ended ribbon, the day
 * the rating window closes. The year is left out; every date these sentences
 * carry is within weeks of today.
 */
export function formatDate(iso: string, timeZone: string, locale = "ar"): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(new Date(iso));
}

export function sameDay(a: string, b: string, timeZone: string): boolean {
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(new Date(iso));
  return day(a) === day(b);
}
