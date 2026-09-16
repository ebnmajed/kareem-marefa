"use server";

import { revalidatePath } from "next/cache";
import { orgSettingsInput, updateOrgSettings } from "@/lib/dal/admin-settings";
import type { Locale } from "@/i18n/routing";

// SCR-063's Server Action (REQ-TEN-008). Zod first, then the DAL — the
// `p2_admin_update` column grant (0004) is the real gate regardless of
// what this action validates.

export type SettingsState = { error: string | null; saved: boolean };

export async function saveSettings(locale: Locale, _prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const num = (n: string) => Number.parseInt(formData.get(n)?.toString() ?? "", 10);
  const str = (n: string) => formData.get(n)?.toString().trim() || null;

  const parsed = orgSettingsInput.safeParse({
    timeZone: formData.get("timeZone")?.toString() ?? "",
    checkInRotationSeconds: num("checkInRotationSeconds"),
    checkInGraceSeconds: num("checkInGraceSeconds"),
    maxCoPresenters: num("maxCoPresenters"),
    companyMetric: formData.get("companyMetric")?.toString(),
    priorityRsvpHours: num("priorityRsvpHours"),
    limitDocumentMb: num("limitDocumentMb"),
    limitAudioMb: num("limitAudioMb"),
    limitImageMb: num("limitImageMb"),
    limitPosterMb: num("limitPosterMb"),
    allowJpegExport: formData.get("allowJpegExport") === "on",
    emailFromName: str("emailFromName"),
    emailReplyTo: str("emailReplyTo"),
    ratingMinAggregate: num("ratingMinAggregate"),
  });
  if (!parsed.success) return { error: "invalid", saved: false };

  const { error } = await updateOrgSettings(locale, parsed.data);
  if (error) return { error, saved: false };
  revalidatePath(`/${locale}/app/admin/settings`);
  return { error: null, saved: true };
}
