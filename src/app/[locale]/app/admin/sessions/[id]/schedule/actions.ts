"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publishSession, scheduleInput, scheduleSession } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import { CUSTOM_VENUE, atZone, checkRelations, deadlineFor, followingEnd, type DeadlinePreset } from "./rules";
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
