"use server";

import { revalidatePath } from "next/cache";
import { resolvePhotoReport } from "@/lib/dal/admin-moderation";
import type { Locale } from "@/i18n/routing";

// SCR-052's Server Action (REQ-ADM-010, REQ-EVT-008). Zod validation lives
// in `resolvePhotoReport` itself.

export type ModerationState = { error: string | null; done: boolean };

export async function resolveReport(locale: Locale, reportId: string, photoId: string, _prev: ModerationState, formData: FormData): Promise<ModerationState> {
  const action = formData.get("action")?.toString();
  if (action !== "remove" && action !== "dismiss") return { error: "unknown", done: false };
  const reason = formData.get("reason")?.toString();

  const { error } = await resolvePhotoReport(locale, { reportId, photoId, action, reason });
  if (error) return { error, done: false };
  revalidatePath(`/${locale}/app/admin/moderation/reports`);
  return { error: null, done: true };
}
