// SCR-043's rules, pure — REQ-SES-002, REQ-SES-016, OQ-001.
//
// Everything the schedule form computes lives here, so the browser and the
// Server Action say the same thing and a unit test pins both.
//
// ★ Times are WALL-CLOCK strings — "YYYY-MM-DDTHH:mm", the value the RTL picker
// carries — in the session's own time zone. Adding sixty minutes to «6:00 م» is
// wall-clock arithmetic («7:00 م»), so it is done on the naive string, read as
// UTC purely as a calendar. Only `atZone()` turns a wall clock into an instant,
// and it is the one place a zone is consulted.

export type DeadlinePreset = "atStart" | "hourBefore" | "dayBefore" | "custom";

export const DEADLINE_PRESETS: readonly DeadlinePreset[] = ["atStart", "hourBefore", "dayBefore", "custom"];

const PRESET_MINUTES: Record<Exclude<DeadlinePreset, "custom">, number> = {
  atStart: 0,
  hourBefore: 60,
  dayBefore: 24 * 60,
};

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function toCalendar(local: string): number | null {
  if (!LOCAL.test(local)) return null;
  const ms = Date.parse(`${local}:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

function fromCalendar(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

/** A wall-clock string moved by `minutes`, or `""` when it is not one. */
export function addMinutes(local: string, minutes: number): string {
  const ms = toCalendar(local);
  return ms === null || !Number.isFinite(minutes) ? "" : fromCalendar(ms + minutes * 60_000);
}

/** `b − a` in minutes, or `null` when either is not a wall-clock string. */
export function minutesBetween(a: string, b: string): number | null {
  const x = toCalendar(a);
  const y = toCalendar(b);
  return x === null || y === null ? null : Math.round((y - x) / 60_000);
}

/**
 * The end a start and a duration imply (REQ-SES-016: «the end follows the
 * duration»). `""` until both are usable, so the form shows «تُحسب النهاية…»
 * rather than a wrong time.
 */
export function followingEnd(startsAt: string, durationMinutes: string): string {
  const minutes = Number(durationMinutes);
  if (!startsAt || durationMinutes.trim() === "" || !Number.isInteger(minutes) || minutes < 15 || minutes > 480) return "";
  return addMinutes(startsAt, minutes);
}

/**
 * Whether a stored end still FOLLOWS the duration. An end that equals start +
 * duration is indistinguishable from one the database derived
 * (`schedule_session()`'s `coalesce(p_ends_at, …)`), so it follows; any other
 * end was set by hand and wins (OQ-001).
 */
export function endFollows(startsAt: string, durationMinutes: string, endsAt: string): boolean {
  return endsAt === "" || endsAt === followingEnd(startsAt, durationMinutes);
}

/**
 * Which preset a stored deadline is. `schedule_session()` stores a missing
 * deadline AS the start (`coalesce(p_rsvp_deadline_at, p_starts_at)`), so «at
 * the start» is both the empty value and the start's own value.
 */
export function presetOf(deadline: string, startsAt: string): DeadlinePreset {
  if (deadline === "" || deadline === startsAt) return "atStart";
  const before = minutesBetween(deadline, startsAt);
  if (before === PRESET_MINUTES.hourBefore) return "hourBefore";
  if (before === PRESET_MINUTES.dayBefore) return "dayBefore";
  return "custom";
}

/** The wall clock a preset means for a given start; `custom` keeps its own value. */
export function deadlineFor(preset: DeadlinePreset, startsAt: string, custom: string): string {
  if (preset === "custom") return custom;
  if (!startsAt) return "";
  return addMinutes(startsAt, -PRESET_MINUTES[preset]);
}

export type RelationField = "endsAt" | "rsvpDeadlineAt" | "cancellationCutoffAt";

/**
 * The relations `REQ-SES-002` makes constraints — `ends_at > starts_at`, both
 * deadlines `<= starts_at` — said at the field, on blur, before the database
 * says them (REQ-SES-016). Returns message keys under `schedule.errors`.
 */
export function checkRelations(v: { startsAt: string; endsAt: string; rsvpDeadlineAt: string; cancellationCutoffAt: string }): Partial<Record<RelationField, string>> {
  const out: Partial<Record<RelationField, string>> = {};
  if (!v.startsAt) return out;
  const end = minutesBetween(v.startsAt, v.endsAt);
  if (end !== null && end <= 0) out.endsAt = "endBeforeStart";
  const rsvp = minutesBetween(v.rsvpDeadlineAt, v.startsAt);
  if (rsvp !== null && rsvp < 0) out.rsvpDeadlineAt = "rsvpAfterStart";
  const cutoff = minutesBetween(v.cancellationCutoffAt, v.startsAt);
  if (cutoff !== null && cutoff < 0) out.cancellationCutoffAt = "cutoffAfterStart";
  return out;
}

/**
 * A wall clock in `timeZone` as an ISO instant, or `null`.
 *
 * `Intl` gives the zone's offset at that instant, which is what makes «6:00 م»
 * mean the clock on the room's wall (OQ-018) rather than wherever the server
 * runs. Moved here from `actions.ts` so the form can show the end as a
 * sentence through the house formatter.
 */
export function atZone(local: string, timeZone: string): string | null {
  if (!LOCAL.test(local)) return null;
  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  const shown = new Date(naive.toLocaleString("en-US", { timeZone }));
  const utc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(naive.getTime() - (shown.getTime() - utc.getTime())).toISOString();
}

/** What REQ-SES-001 needs before «انشر الجلسة» can do anything, from the form as it stands. */
export function missingForPublish(v: {
  startsAt: string;
  durationMinutes: string;
  venueChoice: string;
  customVenueName: string;
  customVenueAddress: string;
  capacity: string;
  venueCapacity: number | null;
}): ("startsAt" | "duration" | "venue" | "capacity")[] {
  const out: ("startsAt" | "duration" | "venue" | "capacity")[] = [];
  if (!v.startsAt) out.push("startsAt");
  if (followingEnd(v.startsAt || "2000-01-01T00:00", v.durationMinutes) === "") out.push("duration");
  const custom = v.venueChoice === CUSTOM_VENUE;
  if (custom ? !v.customVenueName.trim() || !v.customVenueAddress.trim() : !v.venueChoice) out.push("venue");
  // `schedule_session()` fills an empty capacity from the venue's, so a venue
  // with a capacity satisfies it; a one-off place never does.
  if (!v.capacity.trim() && (custom || v.venueCapacity === null)) out.push("capacity");
  return out;
}

/** The venue select's value for «مكان آخر، لمرة واحدة». Never a uuid. */
export const CUSTOM_VENUE = "custom";

// ══ REQ-SES-016 · the day set ══════════════════════════════════════════════
//
// ★ ONE DAY IS THE DEFAULT AND COSTS NOTHING. Everything below runs only once
// «جلسة متعدّدة الأيام» has been opened; a form that never opens it posts no
// `days` field at all, and `schedule_session()` then takes `main`'s path
// (`tests/unit/schedule-days.test.ts` pins the argument object).
//
// ★ NO REORDERING ANYWHERE, and that is `0100` rather than a simplification:
// `position` is the day's CHRONOLOGICAL rank, derived by trigger. A day is
// moved by changing its date, and the list re-sorts. A drag handle could only
// ever disagree with the ranking the database will apply.

/**
 * A day as the form holds it. ★ WALL CLOCK, like every other field on this
 * form: the browser posts what the picker shows and the Server Action turns it
 * into an instant with `atZone()`, so the zone is consulted in exactly one
 * place (REQ-INT-003, OQ-018).
 */
export interface DayDraft {
  /** The stored day's id, `null` for one that has not been saved yet. */
  id: string | null;
  /** A stable React key. A stored id, else a value generated when the row was added. */
  key: string;
  startsAt: string;
  /** ★ `""` means «follow the duration» — the same rule day one's `endMode` states. */
  endsAt: string;
  /** `""`, a venue id, or `CUSTOM_VENUE`. */
  venueChoice: string;
  customVenueName: string;
  customVenueAddress: string;
  customVenueMapUrl: string;
}

/** Everything a day needs from the form to know where it is. */
export type DayPlace = Pick<DayDraft, "venueChoice" | "customVenueName" | "customVenueAddress" | "customVenueMapUrl">;

/** A day's end: the one it was given, else the one the duration implies. */
export function dayEnd(day: { startsAt: string; endsAt: string }, durationMinutes: string): string {
  return day.endsAt || followingEnd(day.startsAt, durationMinutes);
}

/**
 * The next day, defaulted from the one before it (`REQ-SES-016`): **the same
 * clock, the same place, the next date**. Adding a third evening to a workshop
 * that meets 6–8 p.m. in القاعة الكبرى is then one tap on a date.
 */
export function nextDayAfter(previous: { startsAt: string; endsAt: string } & DayPlace, durationMinutes: string, key: string): DayDraft {
  const startsAt = previous.startsAt ? addMinutes(previous.startsAt, 24 * 60) : "";
  // An end carried forward stays explicit only if it WAS explicit; otherwise
  // the new day follows the duration exactly as the previous one does.
  const explicit = previous.endsAt !== "";
  const length = explicit ? minutesBetween(previous.startsAt, previous.endsAt) : null;
  return {
    id: null,
    key,
    startsAt,
    endsAt: explicit && length !== null && startsAt ? addMinutes(startsAt, length) : "",
    venueChoice: previous.venueChoice,
    customVenueName: previous.customVenueName,
    customVenueAddress: previous.customVenueAddress,
    customVenueMapUrl: previous.customVenueMapUrl,
  };
}

export type DayRelation = "dayEndBeforeStart" | "daysOverlap";

/**
 * The two relations a DAY can fail on, said at the field the moment a picker
 * commits (`REQ-SES-016`, `REQ-UIX-010`) — before `0100`'s exclusion constraint
 * says `23P01` and before `schedule_session()` says `days_overlap`.
 *
 * Keyed by the day's INDEX in the list, which is the order the form renders
 * them in, so the summary's first link is the first problem on the page
 * (`DEC-144`). An overlap is reported on the LATER of the two days: the one
 * whose start is the thing to move.
 *
 * ★ A day that is merely EMPTY is not a failure here. Nobody is told they are
 * wrong while they are still filling the form in (`REQ-UIX-011`); the action
 * catches an empty day on submit.
 */
export function checkDays(days: readonly { startsAt: string; endsAt: string }[]): Partial<Record<number, DayRelation>> {
  const out: Partial<Record<number, DayRelation>> = {};
  const spans = days.map((day) => {
    const from = toCalendar(day.startsAt);
    const to = toCalendar(day.endsAt);
    return from === null || to === null ? null : { from, to };
  });

  for (const [i, span] of spans.entries()) {
    if (span && span.to <= span.from) out[i] = "dayEndBeforeStart";
  }
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = i + 1; j < spans.length; j += 1) {
      const a = spans[i];
      const b = spans[j];
      if (!a || !b || a.to <= a.from || b.to <= b.from) continue;
      if (a.from < b.to && b.from < a.to) {
        // The later-starting day carries the message; ties go to the second.
        const later = b.from >= a.from ? j : i;
        out[later] ??= "daysOverlap";
      }
    }
  }
  return out;
}
