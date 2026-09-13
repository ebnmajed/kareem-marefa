// Numerals follow the org setting, consistently (REQ-INT-006, 10 §4).
//
// `org_settings.numerals` decides, not the locale: an Arabic interface may
// legitimately want Western digits, and the same org must then show the same
// digits in the UI, in email, in templates and in exports. So the numbering
// system is named explicitly here rather than inherited from `ar`, whose
// CLDR default is `arab` and would quietly disagree with the setting.
//
// The type is declared here, not imported from the DAL: this module is
// imported by client components, and `src/lib/dal/*` is `server-only`.

export type NumeralSystem = "western" | "arabic";

const formatters = new Map<NumeralSystem, Intl.NumberFormat>();

/** A number in the org's numeral system. */
export function formatNumber(value: number, numerals: NumeralSystem): string {
  let f = formatters.get(numerals);
  if (!f) {
    f = new Intl.NumberFormat(numerals === "arabic" ? "ar-u-nu-arab" : "ar-u-nu-latn");
    formatters.set(numerals, f);
  }
  return f.format(value);
}

/**
 * A date and time in the org's numeral system and time zone (REQ-INT-003,
 * REQ-INT-006, OQ-018).
 *
 * The time zone is the org's, not the reader's: a session happens in a room,
 * and «٦:٠٠ م» has to mean the clock on that room's wall whoever is looking.
 */
export function formatDateTime(iso: string, numerals: NumeralSystem, timeZone: string, locale = "ar"): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-${numerals === "arabic" ? "arab" : "latn"}`, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}
