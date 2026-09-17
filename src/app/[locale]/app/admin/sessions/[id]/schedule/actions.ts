"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publishSession, scheduleInput, scheduleSession } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import { CUSTOM_VENUE, atZone, checkDays, checkRelations, dayEnd, deadlineFor, followingEnd, type DeadlinePreset } from "./rules";
import { SCHEDULE_FIELDS, type ScheduleField, type ScheduleState } from "./state";

// SCR-043's one Server Action (REQ-SES-001, REQ-SES-002, REQ-SES-016).
//
// ★ ONE action for both buttons. «احفظ فقط» and «انشر الجلسة» submit the same
// form with a different `intent`; publishing saves first, then publishes, in one
// press — Server Actions dispatch one at a time per client, so two chained
// actions would be two round trips and a window where the saved schedule and
// the published state disagree.
//
// ★ This is the mirror of the propose form: everything here is schedule-shaped.
// `scheduleInput` is `.strict()`, so a `title` or a `state` in this FormData is
// a parse failure. Authority is `schedule_session()` and `publish_session()`,
// both SECURITY DEFINER over `assert_fresh_admin()`.
//
// ★ No `export type` from this module — see `app/propose/actions.ts`: a
// re-exported type in a "use server" module breaks the build while tsc stays
// clean. The state's type lives in `./state`.

const PRESETS = new Set<string>(["atStart", "hourBefore", "dayBefore", "custom"]);

function presetFrom(raw: string): DeadlinePreset {
  return PRESETS.has(raw) ? (raw as DeadlinePreset) : "atStart";
}

/** One entry of the hidden `days` field, before anything has been checked. */
interface DayPayload {
  id: string | null;
  startsAt: string;
  endsAt: string;
  venueChoice: string;
  customVenueName: string;
  customVenueAddress: string;
  customVenueMapUrl: string;
}

const dayPayload = z
  .object({
    id: z.uuid().nullable(),
    startsAt: z.string(),
    endsAt: z.string(),
    venueChoice: z.string(),
    customVenueName: z.string(),
    customVenueAddress: z.string(),
    customVenueMapUrl: z.string(),
  })
  .strict();

/**
 * The day set as the form posted it, or `undefined` when it posted none.
 *
 * ★ `null` IS NOT A FAILURE AND `undefined` IS NOT A DAY SET. An absent field
 * means «this form does not speak days», which is main's call; a malformed one
 * means someone has been editing the DOM, and that is a whole-form failure
 * rather than a field's.
 */
function parseDays(raw: string): DayPayload[] | null | undefined {
  if (raw === "") return undefined;
  try {
    const parsed = z.array(dayPayload).min(1).max(30).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveSchedule(
  locale: Locale,
  sessionId: string,
  timeZone: string,
  prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const intent = formData.get("intent") === "publish" ? "publish" : "save";
  const captured = formStateFrom<ScheduleField>(formData, { fields: SCHEDULE_FIELDS, previous: prev });
  // `allowWalkIns` is a checkbox: absent means off. It is handed back as "on"
  // or not at all, like the browser sends it, so `was()` reads it the same way.
  const state: ScheduleState = { ...captured, saved: false, published: false };

  const startsAt = was(state, "startsAt").trim();
  const duration = was(state, "durationMinutes").trim();
  const custom = was(state, "venueChoice") === CUSTOM_VENUE;
  const venueId = custom ? "" : was(state, "venueChoice");
  const capacity = was(state, "capacity").trim();
  const explicitEnd = was(state, "endMode") === "explicit";
  const endsAt = explicitEnd ? was(state, "endsAt") : followingEnd(startsAt, duration);
  const rsvpPreset = presetFrom(was(state, "rsvpPreset"));
  const cutoffPreset = presetFrom(was(state, "cutoffPreset"));
  const rsvpDeadlineAt = deadlineFor(rsvpPreset, startsAt, was(state, "rsvpDeadlineAt"));
  const cancellationCutoffAt = deadlineFor(cutoffPreset, startsAt, was(state, "cancellationCutoffAt"));

  // The same checks the form makes on blur, in the same words (REQ-SES-016),
  // so a member who never left a field still gets the field's own message.
  const errors: Partial<Record<ScheduleField, string>> = {};
  if (!startsAt || atZone(startsAt, timeZone) === null) errors.startsAt = "startsAtRequired";
  const minutes = Number(duration);
  if (!duration || !Number.isInteger(minutes) || minutes < 15 || minutes > 480) errors.durationMinutes = "durationRange";
  if (explicitEnd && !endsAt) errors.endsAt = "endRequired";
  if (custom) {
    if (!was(state, "customVenueName").trim()) errors.customVenueName = "customNameRequired";
    if (!was(state, "customVenueAddress").trim()) errors.customVenueAddress = "customAddressRequired";
    const map = was(state, "customVenueMapUrl").trim();
    if (map && !z.url().startsWith("https://").safeParse(map).success) errors.customVenueMapUrl = "mapUrl";
  } else if (!z.uuid().safeParse(venueId).success) {
    errors.venueChoice = "venueRequired";
  }
  const seats = Number(capacity);
  if (capacity && (!Number.isInteger(seats) || seats < 1 || seats > 10000)) errors.capacity = "capacityRange";
  if (rsvpPreset === "custom" && !rsvpDeadlineAt) errors.rsvpDeadlineAt = "deadlineRequired";
  if (cutoffPreset === "custom" && !cancellationCutoffAt) errors.cancellationCutoffAt = "deadlineRequired";
  const relations = checkRelations({ startsAt, endsAt, rsvpDeadlineAt, cancellationCutoffAt });
  for (const [field, key] of Object.entries(relations) as [ScheduleField, string][]) errors[field] ??= key;

  // ── The day set (REQ-SES-015, contract 3) ─────────────────────────────────
  //
  // ★ DAY ONE IS COMPOSED FROM THE FLAT FIELDS, NOT FROM THE PAYLOAD. The
  // hidden field carries day one's stored `id` and nothing else that matters:
  // its window and its place are «التاريخ والوقت», «المدة» and «المكان» above,
  // already parsed and already validated. So the visible controls are
  // authoritative and the two can never disagree — a class of bug that would
  // otherwise only show up as a session whose card says one thing and whose
  // first day says another.
  const posted = parseDays(was(state, "days"));
  if (posted === null) return { ...withFormError(state, "failed"), saved: false, published: false };
  const requireAllDaysRaw = was(state, "requireAllDays");

  const days =
    posted === undefined
      ? null
      : posted.map((day, index) =>
          index === 0
            ? { id: day.id, startsAt, endsAt, venueChoice: was(state, "venueChoice"), customVenueName: was(state, "customVenueName"), customVenueAddress: was(state, "customVenueAddress"), customVenueMapUrl: was(state, "customVenueMapUrl") }
            : { ...day, endsAt: dayEnd(day, duration) },
        );

  if (days) {
    for (const [index, day] of days.entries()) {
      if (index === 0) continue;                       // said at the flat fields
      if (!day.startsAt || atZone(day.startsAt, timeZone) === null) errors[`days.${index}.startsAt`] = "startsAtRequired";
      else if (!day.endsAt) errors[`days.${index}.endsAt`] = "endRequired";
      if (day.venueChoice === CUSTOM_VENUE) {
        if (!day.customVenueName.trim()) errors[`days.${index}.customVenueName`] = "customNameRequired";
        if (!day.customVenueAddress.trim()) errors[`days.${index}.customVenueAddress`] = "customAddressRequired";
      } else if (!z.uuid().safeParse(day.venueChoice).success) {
        errors[`days.${index}.venueChoice`] = "venueRequired";
      }
    }
    // The same two relations the form says on commit, in the same words, so a
    // member who never touched a picker still gets the day's own message.
    for (const [index, relation] of Object.entries(checkDays(days)) as [string, "dayEndBeforeStart" | "daysOverlap"][]) {
      const i = Number(index);
      // Day one has no card: its overlap is said at «التاريخ والوقت», and its
      // end-before-start is `checkRelations`' to say, in its own words.
      if (i === 0) {
        if (relation === "daysOverlap") errors.startsAt ??= "daysOverlap";
      } else if (relation === "daysOverlap") {
        errors[`days.${i}.startsAt`] ??= relation;
      } else {
        errors[`days.${i}.endsAt`] ??= relation;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ...withErrors(state, errors), saved: false, published: false };

  const parsed = scheduleInput.safeParse({
    startsAt: atZone(startsAt, timeZone),
    durationMinutes: minutes,
    // A following end is sent as null, so `schedule_session()` derives it —
    // the same arithmetic, and one source for it on the server.
    endsAt: explicitEnd ? atZone(endsAt, timeZone) : null,
    venueId: custom ? null : venueId,
    customVenueName: custom ? was(state, "customVenueName").trim() : null,
    customVenueAddress: custom ? was(state, "customVenueAddress").trim() : null,
    customVenueMapUrl: custom ? was(state, "customVenueMapUrl").trim() || null : null,
    // Empty means «the venue's capacity», which `schedule_session()` fills in.
    capacity: capacity ? seats : null,
    rsvpDeadlineAt: rsvpDeadlineAt ? atZone(rsvpDeadlineAt, timeZone) : null,
    cancellationCutoffAt: cancellationCutoffAt ? atZone(cancellationCutoffAt, timeZone) : null,
    certificateMode: was(state, "certificateMode") || "off",
    language: was(state, "language") || "ar",
    // DEC-117/DEC-118/DEC-141: this form always states the setting, so an
    // explicit boolean — an absent key is an unticked switch, never «unchanged».
    allowWalkIns: formData.has("allowWalkIns"),
    // ★ The day set, as instants. `null` when the form posted none, which is
    // main's call — `schedule_session()` then writes the session and lets
    // `0100`'s trigger carry the window onto its one day.
    days:
      days === null
        ? null
        : days.map((day) => {
            const dayCustom = day.venueChoice === CUSTOM_VENUE;
            return {
              id: day.id,
              startsAt: atZone(day.startsAt, timeZone)!,
              endsAt: atZone(day.endsAt, timeZone)!,
              venueId: dayCustom ? null : day.venueChoice,
              customVenueName: dayCustom ? day.customVenueName.trim() : null,
              customVenueAddress: dayCustom ? day.customVenueAddress.trim() : null,
              customVenueMapUrl: dayCustom ? day.customVenueMapUrl.trim() || null : null,
            };
          }),
    // ★ The OPPOSITE rule to `allowWalkIns` above, and deliberately so: this
    // control only exists inside the multi-day affordance, so an absent key is
    // «the form never asked», which must leave REQ-SES-017's default standing.
    requireAllDays: requireAllDaysRaw === "" ? null : requireAllDaysRaw === "true",
  });
  if (!parsed.success) return { ...withFormError(state, "failed"), saved: false, published: false };

  try {
    await scheduleSession(locale, sessionId, parsed.data);
  } catch {
    return { ...withFormError(state, "failed"), saved: false, published: false };
  }
  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/schedule`);
  revalidatePath(`/${locale}/app/sessions/${sessionId}`);

  if (intent === "publish") {
    try {
      await publishSession(locale, sessionId);
    } catch {
      // The schedule IS saved; only the publish was refused — publish_session()
      // names the gap, and the page lists it.
      return { ...withFormError(state, "publishFailed"), saved: true, published: false };
    }
    return { ...state, saved: true, published: true };
  }
  return { ...state, saved: true, published: false };
}
