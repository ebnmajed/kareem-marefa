"use server";

import { revalidatePath } from "next/cache";
import { endImpersonation } from "@/lib/dal/platform";
import type { Locale } from "@/i18n/routing";

// The banner's stop control — REQ-ADM-002, SCR-085.
//
// `end_impersonation()` is the only writer of `ended_at` and it audits into the
// ORG's own log, so stopping leaves the same trail as starting. The claims
// survive on the token until it is refreshed, which the control does from the
// client immediately afterwards; the race falls safe either way, because the
// session row is already ended and the next token cannot carry the org.
export async function stopImpersonationAction(locale: Locale, sessionId: string): Promise<void> {
  await endImpersonation(locale, sessionId);
  revalidatePath(`/${locale}/app/platform/impersonate`);
}
