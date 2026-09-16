"use server";

import { revalidatePath } from "next/cache";
import { markCheckedInManually, manualCheckInInput, removeCheckIn, removeCheckInInput } from "@/lib/dal/checkin";
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

// REQ-CHK-017, C3. `remove_check_in()` (0087) is the whole gate — admin-only,
// reason mandatory, idempotent against a second attempt on the same
// check-in. The confirmation dialog on the client (REQ-UIX-013) is what
// makes this safe to submit without a second server-side confirm step; the
// RPC itself has no notion of a "confirmed" flag to check.
export type RemoveState = { error: string | null; done: boolean };

export async function removeCheckInAction(locale: Locale, sessionId: string, _prev: RemoveState, formData: FormData): Promise<RemoveState> {
  const parsed = removeCheckInInput.safeParse({ memberId: formData.get("memberId")?.toString(), reason: formData.get("reason")?.toString() ?? "" });
  if (!parsed.success) {
    const reason = formData.get("reason")?.toString() ?? "";
    return { error: reason.trim().length === 0 ? "reason_required" : "unknown", done: false };
  }

  const result = await removeCheckIn(locale, sessionId, parsed.data.memberId, parsed.data.reason);
  if (!result.ok) return { error: result.error, done: false };

  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/attendance`);
  return { error: null, done: true };
}
