"use server";

import { unstable_rethrow } from "next/navigation";
import { refresh } from "next/cache";
import { getCalendarConnection } from "@/lib/dal/calendar";
import { cancelRsvp, reserveSeat } from "@/lib/dal/rsvp";
import type { ReserveResult } from "@/components/sessions/moment-reserve";

// Bound as `reserveSeatAction.bind(null, locale, sessionId)` by the event page's
// action card and held by `ReserveMoment`'s `useActionState`
// (`components/sessions/moment-reserve.tsx`); the cancel is bound straight onto
// its form.
//
// ★★ THE RESULT IS RETURNED, NEVER DROPPED BY A REDIRECT (wave 16, DEC-195
// §2.1, REQ-UIX-045). Moment 1 plays from this action's own result, in the
// client that pressed — so the action returns the reservation's occurrence and
// REFRESHES the page in the same response instead of redirecting to it. A
// `redirect()` here would drop the result, and a moment keyed to the render
// after it would replay on every visit: the defect this wave exists to prevent.
// It also means a back press no longer lands on the same page (DEC-197 §7).
//
// Every gate is the RPC's and is unchanged: a refusal is a result, not an
// exception, and the refreshed card shows the session's actual state.

export async function reserveSeatAction(locale: string, sessionId: string): Promise<ReserveResult> {
  const outcome = await reserveSeat(locale, sessionId);
  let result: ReserveResult;
  if ("error" in outcome) {
    result = { ok: false, reason: outcome.error === "deadline_passed" || outcome.error === "not_open" ? outcome.error : "unknown" };
  } else if (outcome.status !== "confirmed" && outcome.status !== "waitlisted") {
    result = { ok: false, reason: "unknown" };
  } else {
    result = {
      ok: true,
      status: outcome.status,
      // Only when THIS call made the seat: a double tap, a second tab or a re-POST reads the same seat
      // back, and none of them is a reservation happening (`fresh`, `checkin`'s R2).
      occurrence: outcome.fresh ? `${outcome.id}:${outcome.status}:${outcome.reservedAt}` : null,
      calendar: outcome.status === "confirmed" && outcome.fresh ? await calendarFor(locale) : "manual",
    };
  }
  refresh();
  return result;
}

export async function cancelRsvpAction(locale: string, sessionId: string) {
  await cancelRsvp(locale, sessionId);
  refresh();
}

/** The whisper's truth (DEC-197 §4): `calendar_upsert` syncs a connected member only (`0038`). */
async function calendarFor(locale: string): Promise<"sync" | "manual"> {
  try {
    const connection = await getCalendarConnection(locale);
    return connection && connection.disconnectedAt === null ? "sync" : "manual";
  } catch (e) {
    unstable_rethrow(e);
    // A whisper is an acknowledgement; losing the calendar read must never lose the reservation's answer.
    return "manual";
  }
}
