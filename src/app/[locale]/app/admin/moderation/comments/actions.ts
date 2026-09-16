"use server";

import { revalidatePath } from "next/cache";
import { resolveCommentReport } from "@/lib/dal/admin-moderation";
import type { Locale } from "@/i18n/routing";

// SCR-050's Server Action (REQ-ADM-010, REQ-EVT-014). Zod validation lives
// in `resolveCommentReport` itself (`src/lib/dal/admin-moderation.ts`).

export type ModerationState = { error: string | null; done: boolean };

export async function resolveComment(locale: Locale, reportId: string, _prev: ModerationState, formData: FormData): Promise<ModerationState> {
  const action = formData.get("action")?.toString();
  if (action !== "remove" && action !== "dismiss") return { error: "unknown", done: false };
  const reason = formData.get("reason")?.toString();

  const { error } = await resolveCommentReport(locale, { reportId, action, reason });
  if (error) return { error, done: false };
  revalidatePath(`/${locale}/app/admin/moderation/comments`);
  return { error: null, done: true };
}
