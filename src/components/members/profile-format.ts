// The profile's own formatter — «عضو منذ مارس 2026» (`Profile.dc.html:31`): the month and the year, in Western
// digits (DEC-124) and the ORG's zone, not the server's (REQ-INT-003).
export function formatMonthYear(iso: string, timeZone: string, locale = "ar"): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { month: "long", year: "numeric", timeZone }).format(new Date(iso));
}

/** An average to one decimal — «4.8» — in Western digits. */
export function formatAverage(value: number, locale = "ar"): string {
  return new Intl.NumberFormat(`${locale}-u-nu-latn`, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}
