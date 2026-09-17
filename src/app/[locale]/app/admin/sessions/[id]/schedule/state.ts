import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and nothing else, so the
// field list and the initial state live here, and both halves of the round
// trip import them — `actions.ts` captures against it, the form renders
// against it (the propose form's pattern, `app/propose/state.ts`).

/**
 * Every field SCR-043 can fail on or hand back, IN THE ORDER THE PAGE RENDERS
 * THEM — `<FormSummary>` lists failures in this order, so its first link is
 * the first problem on the page.
 *
 * `endMode`, `rsvpPreset` and `cutoffPreset` are the choices a member makes
 * between a computed value and one they set: the action resolves the time from
 * them with `rules.ts`, the same functions the form shows it with.
 */
export const SCHEDULE_FIELDS = [
  "startsAt",
  "durationMinutes",
  "endMode",
  "endsAt",
  "venueChoice",
  "customVenueName",
  "customVenueAddress",
  "customVenueMapUrl",
  "capacity",
  "allowWalkIns",
  "rsvpPreset",
  "rsvpDeadlineAt",
  "cutoffPreset",
  "cancellationCutoffAt",
  "certificateMode",
  "language",
] as const;

export type ScheduleField = (typeof SCHEDULE_FIELDS)[number];

/**
 * The round trip, plus what succeeded. `saved` and `published` are separate
 * because «انشر الجلسة» saves first: a publish the database refuses still
 * leaves a saved schedule, and the form says both.
 */
export type ScheduleState = FormState<ScheduleField> & { saved: boolean; published: boolean };

export function emptyScheduleState(): ScheduleState {
  return { ...emptyFormState<ScheduleField>(), saved: false, published: false };
}
