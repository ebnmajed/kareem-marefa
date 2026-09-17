import { dayLabel, dayShortLabel, type DayLabelT, type LabelledDay } from "@/components/sessions/day-label";

// ★ THE ONE RULE THIS TRACK'S THREE SCREENS SHARE: a day is named when — and
// only when — the session has more than one. At one day there is nothing to
// disambiguate, so the label is `null`, nothing renders, and the DOM is the one
// wave 7 shipped (contract 7's «flat at n ≤ 1», applied to check-in).
//
// It lives in one function rather than in three `dayCount > 1` conditions
// because the three screens would drift: the host view would keep saying «اليوم
// الأول» on a talk, or the attendance table would grow a column for a session
// that has one.
//
// The WORDS are contract 7's — `dayLabel()` in `components/sessions/day-label.ts`
// — so «اليوم الثاني · الخميس» reads identically here, in `content`'s slots and
// in `notify`'s mail. Nothing is re-spelt here, only withheld.
//
// Serves: REQ-SES-015, REQ-CHK-015, DEC-119, DEC-150 contract 7.

/** Everything a screen needs to decide whether to name a day. */
export interface DayNaming {
  day: LabelledDay | null;
  /** How many days the SESSION has — not how many are on screen. */
  dayCount: number;
  /** The session's zone: a day of a workshop is a fact about the room (OQ-018). */
  timeZone: string;
}

/** True when the session has meetings a reader could confuse for one another. */
export function namesDays(dayCount: number): boolean {
  return dayCount > 1;
}

/**
 * «اليوم الثاني · الخميس», or null at one day.
 *
 * `t` is a translator over `sessions.days`, taken structurally by
 * `DayLabelT` — a server component's `getTranslations("sessions.days")`, a
 * client component's `useTranslations("sessions.days")` and a test's stub all
 * satisfy it, so this module is neither server-only nor client-only.
 */
export function dayName({ day, dayCount, timeZone }: DayNaming, t: DayLabelT, locale = "ar"): string | null {
  if (!day || !namesDays(dayCount)) return null;
  return dayLabel(day, timeZone, t, locale);
}

/** «اليوم الثاني», or null at one day — for a column heading or a chip, where a weekday will not fit. */
export function dayShortName(day: LabelledDay | null, dayCount: number, t: DayLabelT): string | null {
  if (!day || !namesDays(dayCount)) return null;
  return dayShortLabel(day, t);
}
