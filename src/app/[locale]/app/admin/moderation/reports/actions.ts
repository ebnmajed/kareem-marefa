"use server";

import { revalidatePath } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { decideReport } from "@/lib/dal/admin-moderation";
import type { ModerationState } from "../state";

// SCR-050/052's two decisions (REQ-UIX-103, REQ-EVT-014). Zod lives in `decideReport()`; the decision itself is
// `resolve_report()`, one transaction that closes every open report on the comment — and writes no audit row of its
// own (`report.resolved` and `comment.removed` are the database's triggers).

async function decide(locale: Locale, reportId: string, outcome: "removed" | "dismissed", reason?: string): Promise<ModerationState> {
  const result = await decideReport(locale, { reportId, outcome, reason });
  if (!result.done) return { error: result.error, done: false };
  revalidatePath(`/${locale}/app/admin/moderation/reports`);
  return { error: null, done: true };
}

/** «أزل» — from the dialog's form: the reason travels with it (REQ-EVT-014). */
export async function removeReportedComment(locale: Locale, reportId: string, _prev: ModerationState, formData: FormData): Promise<ModerationState> {
  return decide(locale, reportId, "removed", formData.get("reason")?.toString());
}

/** «تجاهل» — one press in the row. */
export async function dismissReportedComment(locale: Locale, reportId: string): Promise<ModerationState> {
  return decide(locale, reportId, "dismissed");
}
