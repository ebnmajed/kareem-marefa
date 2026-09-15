"use server";

import { revalidatePath } from "next/cache";
import { endImpersonation, startImpersonation, startImpersonationInput } from "@/lib/dal/platform";
import type { Locale } from "@/i18n/routing";

// SCR-085's Server Actions — REQ-ADM-002, REQ-ADM-019, DEC-014.
//
// ★ Starting a session writes the row to THE ORG'S OWN audit log in the same
// transaction as the session row, inside `start_impersonation()`. There is no
// path here that reaches an org without leaving that trace, because the trace
// and the session are one insert apart in one function.
//
// The token is minted at issuance, so the claims a started session carries
// arrive on the NEXT access token. The client refreshes the session right
// after this action returns; until it does, the super admin is still just a
// super admin, which is the safe direction for the race to fall.

export type ImpersonationState = { error: string | null; started: boolean };

export async function startImpersonationAction(
  locale: Locale,
  _prev: ImpersonationState,
  formData: FormData,
): Promise<ImpersonationState> {
  const parsed = startImpersonationInput.safeParse({
    orgId: formData.get("orgId")?.toString() ?? "",
    reason: formData.get("reason")?.toString() ?? "",
    minutes: Number(formData.get("minutes")?.toString() ?? "60"),
  });
  if (!parsed.success) return { error: "invalid", started: false };

  const result = await startImpersonation(locale, parsed.data);
  if (result.status === "failed") return { error: result.message, started: false };

  revalidatePath(`/${locale}/app/platform/impersonate`);
  return { error: null, started: true };
}

export async function endImpersonationAction(locale: Locale, sessionId?: string): Promise<void> {
  await endImpersonation(locale, sessionId);
  revalidatePath(`/${locale}/app/platform/impersonate`);
}
