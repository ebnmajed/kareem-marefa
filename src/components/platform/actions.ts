"use server";

import { endImpersonation } from "@/lib/dal/platform";
import type { Locale } from "@/i18n/routing";

// The stop control's Server Action — REQ-ADM-002, SCR-085.
//
// `end_impersonation()` is the only writer of `ended_at` and it audits into the
// ORG's own log, so stopping leaves the same trail as starting.
//
// ★ NO `revalidatePath` HERE (wave 8, notes W8.0 F1/F2). The claims live on the
// access token until it is refreshed, so the order that matters is: end the
// row, refresh the token, THEN re-render. The control does the last two from
// the client in that order; revalidating here would re-render the page with
// the OLD token still in the cookie, one step early.

export type StopState = { error: string | null };

export async function stopImpersonationAction(locale: Locale, sessionId: string): Promise<StopState> {
  const result = await endImpersonation(locale, sessionId);
  return { error: result.status === "failed" ? result.message : null };
}
