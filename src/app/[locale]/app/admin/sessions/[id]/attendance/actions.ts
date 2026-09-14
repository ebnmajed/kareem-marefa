"use server";

import { revalidatePath } from "next/cache";
import { markCheckedInManually, manualCheckInInput } from "@/lib/dal/checkin";
import type { Locale } from "@/i18n/routing";

// SCR-044's manual-mark form (REQ-CHK-008). `mark_checked_in_manually`
// (0015) is the whole gate: admin or moderator, session `in_progress`, a
// non-empty reason — re-checked there regardless of what this module
// thinks the session's state is.

export type ManualMarkState = { error: string | null; done: boolean; memberId?: string; reason?: string };

export async function markManually(locale: Locale, sessionId: string, _prev: ManualMarkState, formData: FormData): Promise<ManualMarkState> {
  const parsed = manualCheckInInput.safeParse({ memberId: formData.get("memberId")?.toString(), reason: formData.get("reason")?.toString() ?? "" });
  // A blank reason is the one shape failure a person can cause on purpose,
  // and the screen has a sentence for it (REQ-CHK-008: the reason is
  // mandatory); everything else malformed is "unknown".
  // React 19 resets a <form action> when the action resolves, so a failure
  // hands back what was typed and each field reads its defaultValue from it
  // (TEAM.md §5) — otherwise the member selection is gone on the retry and
  // the browser's `required` on the select blocks the second submit.
  const typed = { memberId: formData.get("memberId")?.toString() ?? "", reason: formData.get("reason")?.toString() ?? "" };
  if (!parsed.success) return { error: typed.reason.trim().length === 0 ? "reason_required" : "unknown", done: false, ...typed };

  const result = await markCheckedInManually(locale, sessionId, parsed.data.memberId, parsed.data.reason);
  if (!result.ok) return { error: result.error, done: false, ...typed };

  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/attendance`);
  return { error: null, done: true };
}
