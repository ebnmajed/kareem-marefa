"use server";

import { revalidatePath } from "next/cache";
import { requestDeactivation, requestMyExport } from "@/lib/dal/privacy";
import type { Locale } from "@/i18n/routing";

// `/app/me/privacy`'s Server Actions — REQ-PRF-006, REQ-PRF-007, REQ-NFR-005.
//
// The export's rate limit is NOT here. It lives in `request_data_export()`,
// in the same transaction as the insert it guards, because a limit checked in
// an action is a limit two concurrent submissions race past.

export type PrivacyState = { error: string | null; ok: boolean };

// `useActionState` fixes the signature; this action needs neither argument —
// the member is the session and there is nothing to read from the form.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function requestExportAction(locale: Locale, _prev: PrivacyState, _formData: FormData): Promise<PrivacyState> {
  const result = await requestMyExport(locale);
  if (result.status === "failed") return { error: result.message, ok: false };
  revalidatePath(`/${locale}/app/me/privacy`);
  return { error: null, ok: true };
}

export async function requestDeactivationAction(
  locale: Locale,
  _prev: PrivacyState,
  formData: FormData,
): Promise<PrivacyState> {
  const result = await requestDeactivation(locale, formData.get("reason")?.toString() ?? "");
  if (result.status === "failed") return { error: result.message, ok: false };
  revalidatePath(`/${locale}/app/me/privacy`);
  return { error: null, ok: true };
}
