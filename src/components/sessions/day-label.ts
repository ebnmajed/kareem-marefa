import { formatDate, formatNumber, formatWeekday } from "@/components/sessions/numerals";

// ★ CONTRACT 7 — the one day label, and every track renders the same words.
//
// «اليوم الأول · الأربعاء» is read by `content`'s three slots, `checkin`'s
// screens and `notify`'s mail as well as by this track's own pages. Four
// formatters would be four chances for a workshop to call Wednesday «اليوم
// الثاني» on one surface and «اليوم 2» on another, so there is one.
//
// ★ NO next-intl IMPORT. The translator is taken STRUCTURALLY — the pattern
// `lib/form-state.ts` set for `zodErrors()` and its `ZodError`. So a server
// component's `getTranslations("sessions.days")`, a client component's
// `useTranslations("sessions.days")` and a unit test's own stub all satisfy it,
// and the module is neither server-only nor client-only.
//
// ★ ORDINALS ARE WORDS TO TEN, DIGITS FROM ELEVEN. Arabic ordinals are single
// words up to «العاشر» and compound from «الحادي عشر» — heavy in a card
// heading, and eleven more keys to reach a length nobody schedules. From day
// eleven the label switches to `labelNumeric` and the Western digit DEC-124
// requires: **day eleven reads «اليوم 11 · الأحد»**. The switch lives here, so
// every surface makes it at the same number.
//
// Serves: REQ-SES-015, REQ-SES-018, DEC-119, DEC-121, DEC-124, DEC-150 c7.

/**
 * The ten keys that have a word of their own, as a literal tuple.
 *
 * ★ Indexed, never built as `` `ordinal.${n}` ``. A template-literal key is
 * `string` to the compiler, and next-intl types a translator's key as the union
 * of the keys its namespace actually has — so a built key would force every
 * call site to widen `t` to `(key: string) => string` and give up the one check
 * that catches a renamed message before a screen does.
 */
const ORDINAL_KEYS = [
  "ordinal.1",
  "ordinal.2",
  "ordinal.3",
  "ordinal.4",
  "ordinal.5",
  "ordinal.6",
  "ordinal.7",
  "ordinal.8",
  "ordinal.9",
  "ordinal.10",
] as const;

/** Every key this module asks for, and nothing else. */
export type DayLabelKey = "label" | "labelNumeric" | "short" | "shortNumeric" | "count" | "range" | (typeof ORDINAL_KEYS)[number];

/**
 * next-intl's `t`, taken structurally. See the header.
 *
 * A `Translator` over `sessions.days` accepts a SUPERSET of `DayLabelKey`, so
 * it satisfies this by ordinary contravariance — no cast at any call site, and
 * a key removed from `sessions.json` stops compiling here.
 */
export type DayLabelT = (key: DayLabelKey, values?: Record<string, string | number>) => string;

/** The least a caller has to know about a day to name it. */
export interface LabelledDay {
  /** The chronological rank the database derives (DEC-150). 1…n. */
  position: number;
  startsAt: string;
}

/** The highest position that has a word of its own under `sessions.days.ordinal`. */
export const NAMED_ORDINALS = ORDINAL_KEYS.length;

/** True while the position has a word; false from eleven, where the digit takes over. */
function named(position: number): boolean {
  return Number.isInteger(position) && position >= 1 && position <= NAMED_ORDINALS;
}

/**
 * «الأول» for day one … «العاشر» for day ten; the Western digit from eleven.
 *
 * For a chip or a group heading with no room for a weekday, and the building
 * block of `dayLabel()`.
 */
export function dayOrdinal(position: number, t: DayLabelT): string {
  return named(position) ? t(ORDINAL_KEYS[position - 1]) : formatNumber(position);
}

/** «اليوم الأول» — the ordinal alone, as a phrase. */
export function dayShortLabel(day: LabelledDay, t: DayLabelT): string {
  return named(day.position)
    ? t("short", { ordinal: dayOrdinal(day.position, t) })
    : t("shortNumeric", { value: formatNumber(day.position) });
}

/**
 * «اليوم الأول · الأربعاء» — the label, and the answer to contract 7.
 *
 * The weekday is read in the SESSION'S zone, not the reader's: a day of a
 * workshop is a fact about the room (OQ-018), and a Riyadh evening read in UTC
 * is the previous weekday.
 */
export function dayLabel(day: LabelledDay, timeZone: string, t: DayLabelT, locale = "ar"): string {
  const weekday = formatWeekday(day.startsAt, timeZone, locale);
  return named(day.position)
    ? t("label", { ordinal: dayOrdinal(day.position, t), weekday })
    : t("labelNumeric", { value: formatNumber(day.position), weekday });
}

/**
 * «الأربعاء، 1 أكتوبر — الجمعة، 3 أكتوبر» — a session's span, for a card.
 *
 * ★ The two instants are the SESSION'S stored window (`starts_at`, `ends_at`),
 * which contract 1 makes the first day's start and the last day's end. A
 * caller must never compute them from a day array — there is nothing to
 * compute, and a list that is one page of a session's days would compute a
 * shorter range than the session has.
 */
export function dayRange(startsAt: string, endsAt: string, timeZone: string, t: DayLabelT, locale = "ar"): string {
  return t("range", { from: formatDate(startsAt, timeZone, locale), to: formatDate(endsAt, timeZone, locale) });
}

/**
 * «3 أيام» — the count, with all six ICU forms and a Western numeral.
 *
 * `value` travels beside `count` because `DEC-124` forbids the Arabic-Indic
 * digits an `{count}` placeholder would print in an `ar` message; every plural
 * in this product is written the same way.
 */
export function dayCountLabel(count: number, t: DayLabelT): string {
  return t("count", { count, value: formatNumber(count) });
}
