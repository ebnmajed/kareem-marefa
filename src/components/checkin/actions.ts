"use server";

import { redirect } from "next/navigation";
import { cancelRsvp, reserveSeat } from "@/lib/dal/rsvp";

// Bound as `action={reserveSeatAction.bind(null, locale, sessionId)}` from
// the RsvpPanel slot (rsvp-panel.tsx) — SlotProps is frozen to
// {sessionId, memberId, locale} (src/components/sessions/slots.ts), so
// there's no room to carry a per-render error prop back into the slot; a
// failed reserve/cancel just redirects without a query flag, and the panel's
// next render shows the session's actual current state (docs/plan/notes/checkin.md).

export async function reserveSeatAction(locale: string, sessionId: string) {
  await reserveSeat(locale, sessionId);
  redirect(`/${locale}/app/sessions/${sessionId}`);
}

export async function cancelRsvpAction(locale: string, sessionId: string) {
  await cancelRsvp(locale, sessionId);
  redirect(`/${locale}/app/sessions/${sessionId}`);
}
