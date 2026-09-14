"use server";

import { revalidatePath } from "next/cache";
import { resolvePhotoTakedown } from "@/lib/dal/admin-moderation";
import type { Locale } from "@/i18n/routing";

// SCR-051's Server Action (REQ-ADM-010, REQ-EVT-012). Zod validation lives
// in `resolvePhotoTakedown` itself.

export type ModerationState = { error: string | null };

export async function resolveTakedown(locale: Locale, takedownId: string, photoId: string, _prev: ModerationState, formData: FormData): Promise<ModerationState> {
  const action = formData.get("action")?.toString();
  if (action !== "restore" && action !== "remove") return { error: "unknown" };
  const reason = formData.get("reason")?.toString();

  const { error } = await resolvePhotoTakedown(locale, { takedownId, photoId, action, reason });
  if (error) return { error };
  revalidatePath(`/${locale}/app/admin/moderation/photos`);
  return { error: null };
}
