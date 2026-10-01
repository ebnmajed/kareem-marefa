// The week's month names (wave 18, REQ-UIX-055). A snapshot's period is a DATE the job wrote from the
// database's UTC month (0042), so it is named in UTC: «سبتمبر» for `2026-09-01`, whatever the reader's zone.
// The numbering system is Latin, as everywhere (DEC-124) — a month name carries no digit, but a formatter
// built on the bare `ar` locale is exactly how Arabic-Indic digits get in.

/** The month of a `YYYY-MM-DD` date, by name. */
export function monthName(date: string, locale = "ar"): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
