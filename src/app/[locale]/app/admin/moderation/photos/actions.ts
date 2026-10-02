"use server";

import { revalidatePath } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { decideReport, removeModeratedPhoto, restoreModeratedPhoto, type ModerationResult } from "@/lib/dal/admin-moderation";
import type { ModerationState } from "../state";

// SCR-051's three decisions (REQ-UIX-104, REQ-EVT-012, REQ-EVT-014). Each is ONE function or ONE statement in the
// database, and none writes `audit_log` here: `photo.removed`, `photo.restored` and `report.resolved` are triggers'.
// The queue is the layout's, so the layout is revalidated with the page.

function answer(locale: Locale, result: ModerationResult): ModerationState {
  if (!result.done) return { error: result.error, done: false };
  revalidatePath(`/${locale}/app/admin/moderation/photos`, "layout");
  return { error: null, done: true };
}

/** «احذف نهائيًا» — from the dialog's form, with its reason (REQ-EVT-014). */
export async function removePhoto(locale: Locale, photoId: string, _prev: ModerationState, formData: FormData): Promise<ModerationState> {
  return answer(locale, await removeModeratedPhoto(locale, { photoId, reason: formData.get("reason")?.toString() ?? "" }));
}

/** «أعدها للعرض» — a takedown that was a mistake (REQ-EVT-012). One press. */
export async function restorePhoto(locale: Locale, photoId: string): Promise<ModerationState> {
  return answer(locale, await restoreModeratedPhoto(locale, { photoId }));
}

/** «تجاهل» — a report on a photo that stays visible; every open report on it closes. One press. */
export async function dismissPhotoReports(locale: Locale, reportId: string): Promise<ModerationState> {
  return answer(locale, await decideReport(locale, { reportId, outcome: "dismissed" }));
}
