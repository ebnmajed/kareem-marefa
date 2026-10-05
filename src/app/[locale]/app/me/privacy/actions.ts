"use server";

import { revalidatePath } from "next/cache";
import { requestDeactivation, requestMyExport } from "@/lib/dal/privacy";
import { setMyAvatarImport, type AvatarAnswer } from "@/lib/dal/avatars";
import type { Locale } from "@/i18n/routing";

// `/app/me/privacy`'s Server Actions — REQ-PRF-006, REQ-PRF-007, REQ-NFR-005.
//
// The export's rate limit is NOT here. It lives in `request_data_export()`,
// in the same transaction as the insert it guards, because a limit checked in
// an action is a limit two concurrent submissions race past.

export type PrivacyState = { error: string | null; ok: boolean };

// `useActionState` fixes the signature; this action needs neither argument —
// the member is the session and there is nothing to read from the form.
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

/**
 * «نستخدم صورتك من Google؟» — answered on the /app timeline's prompt, or changed
 * here on /app/me/privacy (REQ-PRF-008, DEC-182). The answer is bound, not read
 * from the form: the two buttons are two forms, each bound to its own answer
 * (DEC-159). The layout is revalidated because the shell's account menu draws
 * the picture, and a decline takes it away at once.
 */
export async function setAvatarImportAction(locale: Locale, answer: AvatarAnswer, _prev: PrivacyState, _formData: FormData): Promise<PrivacyState> {
  const result = await setMyAvatarImport(locale, answer);
  if (result.status === "failed") return { error: "failed", ok: false };
  revalidatePath(`/${locale}/app`, "layout");
  return { error: null, ok: true };
}
