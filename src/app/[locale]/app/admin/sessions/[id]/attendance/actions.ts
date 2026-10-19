"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { markCheckedInManually, manualCheckInInput, removeCheckIn, removeCheckInInput, revokeCodeResult, setCheckInOpen } from "@/lib/dal/checkin";
import type { Locale } from "@/i18n/routing";

// ★ The day both forms send (DEC-119). An admin corrects Tuesday's list on
// Thursday, so the day is the FORM's answer and never the clock's — a null
// here would let `resolve_session_day()` pick Thursday for a Tuesday
// correction. Anything that is not a uuid becomes null rather than an error:
// the RPC then resolves it exactly as `main`'s call does, which at one day is
// the one day, and a hand-forged id of another session is refused there
// (`not_found`) rather than trusted here.
function dayOf(formData: FormData): string | null {
  const raw = formData.get("dayId")?.toString() ?? "";
  return z.uuid().safeParse(raw).success ? raw : null;
}

// SCR-044's manual-mark form (REQ-CHK-008). `mark_checked_in_manually`
// (0015) is the whole gate: admin or moderator, session `in_progress`, a
// non-empty reason — re-checked there regardless of what this module
// thinks the session's state is.

export type ManualMarkState = { error: string | null; done: boolean; memberId?: string; reason?: string; memberIds?: string[]; marked?: number };

/**
 * ★ DEC-299 (REQ-SES-025): several members at once — a past event is logged with everyone who came, under one
 * reason. Each is the same `mark_checked_in_manually()` call, in order, inside this ONE action (Server Actions
 * serialise per client, so the loop belongs here). The first refusal is reported and the members not yet marked
 * stay selected; those already marked are marked — the RPC is idempotent per member per day, so a retry is safe.
 */
export async function markManually(locale: Locale, sessionId: string, _prev: ManualMarkState, formData: FormData): Promise<ManualMarkState> {
  const reason = formData.get("reason")?.toString() ?? "";
  const ids = [...new Set(formData.getAll("memberId").map((v) => v.toString()).filter(Boolean))];
  // React 19 resets a <form action> when the action resolves, so a failure hands back what was typed and each field
  // reads its value from it (TEAM.md §5).
  const typed = { memberId: ids[0] ?? "", memberIds: ids, reason };
  if (ids.length === 0 || ids.length > 500 || !ids.every((id) => z.uuid().safeParse(id).success)) return { error: "unknown", done: false, ...typed };
  // A blank reason is the one shape failure a person can cause on purpose (REQ-CHK-008: the reason is mandatory).
  if (!manualCheckInInput.safeParse({ memberId: ids[0], reason }).success) {
    return { error: reason.trim().length === 0 ? "reason_required" : "unknown", done: false, ...typed };
  }

  const day = dayOf(formData);
  let marked = 0;
  for (const [i, memberId] of ids.entries()) {
    const result = await markCheckedInManually(locale, sessionId, memberId, reason.trim(), day);
    if (!result.ok) {
      if (marked > 0) revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/attendance`);
      const left = ids.slice(i);
      return { error: result.error, done: false, memberId: left[0], memberIds: left, reason, marked };
    }
    marked += 1;
  }

  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/attendance`);
  return { error: null, done: true, marked };
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

  const result = await removeCheckIn(locale, sessionId, parsed.data.memberId, parsed.data.reason, dayOf(formData));
  if (!result.ok) return { error: result.error, done: false };

  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/attendance`);
  return { error: null, done: true };
}

// ── wave 21 (SCR-044 rebuilt, REQ-UIX-090), add-only — everything above is unchanged ──────────────────────────────
//
// The code card's two controls and the manual mark's no-JS twin. Each redirects back to the tab, so each works
// without JavaScript, and each keeps the day it was SHOWN (DEC-119) in `?day=` — never the clock's.

function base(locale: Locale, sessionId: string, dayId: string | null, query = ""): string {
  const params = new URLSearchParams(query);
  if (dayId) params.set("day", dayId);
  const qs = params.toString();
  return `/${locale}/app/admin/sessions/${sessionId}/attendance${qs ? `?${qs}` : ""}`;
}

/** «أبطل» (REQ-CHK-007): one tap; the RPC re-derives who may and issues the replacement at once. */
export async function revokeCodeAction(locale: Locale, sessionId: string, dayId: string | null) {
  const result = await revokeCodeResult(locale, sessionId, dayId);
  redirect(base(locale, sessionId, dayId, result.ok ? "" : `revokeError=${result.error}`));
}

/** The door (REQ-CHK-015, -016, DEC-141): `open` is bound at the call site; `set_check_in_open()` owns the ceiling. */
export async function setCheckInOpenAction(locale: Locale, sessionId: string, open: boolean, dayId: string | null) {
  const result = await setCheckInOpen(locale, sessionId, open, dayId);
  redirect(base(locale, sessionId, dayId, result.ok ? "" : `switchError=${result.error}`));
}

/** The manual mark without JavaScript (K34): the same validation and RPC as `markManually`, answered by redirect. */
export async function markManuallyNoScript(locale: Locale, sessionId: string, formData: FormData) {
  const dayId = dayOf(formData);
  const parsed = manualCheckInInput.safeParse({ memberId: formData.get("memberId")?.toString(), reason: formData.get("reason")?.toString() ?? "" });
  if (!parsed.success) redirect(base(locale, sessionId, dayId, "manualError=reason_required"));
  const result = await markCheckedInManually(locale, sessionId, parsed.data.memberId, parsed.data.reason, dayId);
  if (!result.ok) redirect(base(locale, sessionId, dayId, `manualError=${result.error}`));
  revalidatePath(`/${locale}/app/admin/sessions/${sessionId}/attendance`);
  redirect(base(locale, sessionId, dayId));
}
