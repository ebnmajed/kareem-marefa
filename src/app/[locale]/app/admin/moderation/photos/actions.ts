"use server";

import { revalidatePath } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { decideModeratedFrame, decideReport, removeModeratedPhoto, restoreModeratedPhoto, type ModerationResult } from "@/lib/dal/admin-moderation";
import type { ModerationState } from "../state";

// SCR-051's three decisions (REQ-UIX-104, REQ-EVT-012, REQ-EVT-014). Each is ONE function or ONE statement in the
// database, and none writes `audit_log` here: `photo.removed`, `photo.restored` and `report.resolved` are triggers'.
// The queue is the layout's, so the layout is revalidated with the page.

function answer(locale: Locale, result: ModerationResult): ModerationState {
  // Decided already, elsewhere: the queue is stale, so it is refreshed with the refusal.
  if (result.done || result.error === "already_resolved") revalidatePath(`/${locale}/app/admin/moderation/photos`, "layout");
  return result.done ? { error: null, done: true } : { error: result.error, done: false };
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

// ── wave 26 — a story frame (REQ-STO-014, REQ-STO-015): `decide_story_frame()`, one function each ──────────────────

/** «احذف نهائيًا» on a frame — `remove_story_frame()`, with its reason. */
export async function removeFrame(locale: Locale, frameId: string, _prev: ModerationState, formData: FormData): Promise<ModerationState> {
  return answer(locale, await decideModeratedFrame(locale, { frameId, outcome: "removed", reason: formData.get("reason")?.toString() ?? "" }));
}

/** «أعدها للعرض» — a frame hidden by a request or a report that was a mistake. */
export async function restoreFrame(locale: Locale, frameId: string): Promise<ModerationState> {
  return answer(locale, await decideModeratedFrame(locale, { frameId, outcome: "restored" }));
}
