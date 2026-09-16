"use server";

import { startImpersonation, startImpersonationInput } from "@/lib/dal/platform";
import type { Locale } from "@/i18n/routing";
import { emptyFormState, formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { IMPERSONATE_FIELDS, type ImpersonateField, type ImpersonationState } from "./state";

// SCR-085's Server Action — REQ-ADM-002, REQ-ADM-019, DEC-014.
//
// ★ Starting a session writes the row to THE ORG'S OWN audit log in the same
// transaction as the session row, inside `start_impersonation()`. There is no
// path here that reaches an org without leaving that trace.
//
// ★ NO `revalidatePath`, and that is the fix for a real bug (wave 8, notes W8.0
// F2, measured red on the build before it). The claims a session carries are
// minted into the NEXT access token. The form used to refresh the token from a
// `useEffect` on `started` — but this action revalidated the page, the same
// response swapped the form for the active panel, and an unmounted component's
// effect never runs: the session existed, the org's log had the row, and the
// token never carried the org. Now the action only starts the session; the form
// refreshes the token in its own submit path and THEN re-renders the page.
//
// Stopping is the product's one stop control (`components/platform/stop-control.tsx`).

function errorKey(field: ImpersonateField, code: string, empty: boolean): string {
  switch (field) {
    case "orgId":
      return "orgRequired";
    case "reason":
      return empty ? "reason_required" : code === "too_big" ? "reasonTooLong" : "reasonTooShort";
    default:
      return "minutesInvalid";
  }
}

export async function startImpersonationAction(
  locale: Locale,
  prev: ImpersonationState,
  formData: FormData,
): Promise<ImpersonationState> {
  const captured = formStateFrom<ImpersonateField>(formData, { fields: IMPERSONATE_FIELDS, previous: prev });
  const raw = {
    orgId: was(captured, "orgId"),
    reason: was(captured, "reason"),
    minutes: Number(was(captured, "minutes") || Number.NaN),
  };
  const parsed = startImpersonationInput.safeParse(raw);
  if (!parsed.success) {
    return { ...withErrors(captured, zodErrors<ImpersonateField>(parsed.error, errorKey, { ...raw, reason: raw.reason.trim() })), started: false };
  }

  const result = await startImpersonation(locale, parsed.data);
  if (result.status === "failed") {
    // The two refusals that belong to a field land on it; the rest are the form's.
    if (result.message === "reason_required") return { ...withErrors(captured, { reason: "reason_required" }), started: false };
    if (result.message === "org_not_found") return { ...withErrors(captured, { orgId: "org_not_found" }), started: false };
    return { ...withFormError(captured, result.message), started: false };
  }
  return { ...emptyFormState<ImpersonateField>(), started: true };
}
