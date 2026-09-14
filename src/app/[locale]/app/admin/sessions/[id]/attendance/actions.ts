"use server";

import { revalidatePath } from "next/cache";
import { markCheckedInManually, manualCheckInInput } from "@/lib/dal/checkin";
import type { Locale } from "@/i18n/routing";

// SCR-044's manual-mark form (REQ-CHK-008). `mark_checked_in_manually`
// (0015) is the whole gate: admin or moderator, session `in_progress`, a
// non-empty reason — re-checked there regardless of what this module
// thinks the session's state is.

export type ManualMarkState = { error: string | null; done: boolean };

export async function markManually(locale: Locale, sessionId: string, _prev: ManualMarkState, formData: FormData): Promise<ManualMarkState> {
  const parsed = manualCheckInInput.safeParse({ memberId: formData.get("memberId")?.toString(), reason: formData.get("reason")?.toString() ?? "" });
  if (!parsed.success) return { error: "unknown", done: false };

  const result = await markCheckedInManually(locale, sessionId, parsed.data.memberId, parsed.data.reason);
  if (!result.ok) return { error: result.error, done: false };

  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/attendance`);
  return { error: null, done: true };
}
