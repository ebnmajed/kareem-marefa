"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publishSession, scheduleInput, scheduleSession } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";

// SCR-043's Server Actions (REQ-SES-001, REQ-SES-002).
//
// ★ This is the mirror of the propose form: everything here is
// schedule-shaped and nothing else is. `scheduleInput` is `.strict()`, so a
// `title` or a `state` arriving in this FormData is a parse failure — those
// belong to the presenter's four-column grant, not to an admin's date picker.
//
// Authority is in `schedule_session()` and `publish_session()`, both SECURITY
// DEFINER over `assert_fresh_admin()`, because 0010 grants an admin no write
// on any scheduling column at all.

export type ScheduleState = { error: string | null; saved: boolean; published: boolean };

/**
 * A `datetime-local` value carries no offset, so it is read in the session's
 * own time zone rather than the server's. `Intl` gives the offset for that
 * zone at that instant, which is what makes «6:00 م» mean the clock on the
 * room's wall (OQ-018) instead of the clock wherever Vercel happens to run.
 */
function atZone(local: string, timeZone: string): string | null {
  if (!local) return null;
  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  const shown = new Date(naive.toLocaleString("en-US", { timeZone }));
  const utc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(naive.getTime() - (shown.getTime() - utc.getTime())).toISOString();
}

const optional = (formData: FormData, name: string) => formData.get(name)?.toString().trim() || null;

export async function saveSchedule(locale: Locale, sessionId: string, timeZone: string, _prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const custom = formData.get("venueKind")?.toString() === "custom";
  const duration = optional(formData, "durationMinutes");
  const capacity = optional(formData, "capacity");
  const endsLocal = optional(formData, "endsAt");
  const rsvpLocal = optional(formData, "rsvpDeadlineAt");
  const cutoffLocal = optional(formData, "cancellationCutoffAt");

  const parsed = scheduleInput.safeParse({
    startsAt: atZone(formData.get("startsAt")?.toString() ?? "", timeZone) ?? "",
    durationMinutes: duration === null ? Number.NaN : Number(duration),
    endsAt: endsLocal === null ? null : atZone(endsLocal, timeZone),
    venueId: custom ? null : optional(formData, "venueId"),
    customVenueName: custom ? optional(formData, "customVenueName") : null,
    customVenueAddress: custom ? optional(formData, "customVenueAddress") : null,
    customVenueMapUrl: custom ? optional(formData, "customVenueMapUrl") : null,
    capacity: capacity === null ? null : Number(capacity),
    rsvpDeadlineAt: rsvpLocal === null ? null : atZone(rsvpLocal, timeZone),
    cancellationCutoffAt: cutoffLocal === null ? null : atZone(cutoffLocal, timeZone),
    certificateMode: formData.get("certificateMode")?.toString() ?? "off",
    language: formData.get("language")?.toString() ?? "ar",
    // DEC-117/DEC-118: an explicit true/false, never null ("unchanged") — an
    // unchecked checkbox sends no `allowWalkIns` key at all, and `.has()`
    // is exactly the presence check that turns that into a real `false`
    // rather than letting "absent" stand in for it (sessions' own note on
    // contract 1). This form always states the setting; `null` is for a
    // caller that doesn't touch the field at all, which this one isn't. Safe
    // now that `initial.allowWalkIns` is required in schedule-form.tsx and
    // the checkbox always starts from the session's real value (the interim
    // `allowWalkInsKnown` marker this comment used to describe is gone as of
    // `page.tsx`'s own read-back at `343991d`).
    allowWalkIns: formData.has("allowWalkIns"),
  });
  if (!parsed.success) return { error: "invalid", saved: false, published: false };

  try {
    await scheduleSession(locale, sessionId, parsed.data);
  } catch {
    return { error: "failed", saved: false, published: false };
  }
  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/schedule`);
  return { error: null, saved: true, published: false };
}

export async function publish(locale: Locale, sessionId: string, _prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  void formData; // the button carries no fields; the session id is bound
  if (!z.uuid().safeParse(sessionId).success) return { error: "failed", saved: false, published: false };
  try {
    await publishSession(locale, sessionId);
  } catch {
    // The gate is 0010's check constraint and publish_session() names the gap;
    // the page already lists it, so this only has to stop claiming success.
    return { error: "failed", saved: false, published: false };
  }
  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/schedule`);
  revalidatePath(`/${locale}/app/sessions/${sessionId}`);
  return { error: null, saved: false, published: true };
}
