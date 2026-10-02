"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSessionDirect, createSessionFromProposal, directSessionInput, transitionSession, type SessionAction } from "@/lib/dal/sessions";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, wasList, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { SESSION_VALUE_FIELDS, type BulkCancelState, type CreateSessionState, type SessionField } from "./state";

// SCR-042's Server Actions (REQ-PRO-007). Zod first, then the DAL.
//
// Authority lives in `create_session()`, which is SECURITY DEFINER and opens
// with assert_fresh_admin(): `sessions` has no insert policy and no insert
// grant, so there is no other way to make one and no way for this action to
// widen who may.
//
// ★ NO `export type { CreateSessionState }` HERE — a `"use server"` module's
// exports become an actions manifest built from the export LIST, so a
// re-exported TYPE is still in it and Turbopack tries to import a value that
// erased at compile time. `tsc` sees nothing wrong; only `npm run build`
// catches it, and the build is lead-only this milestone — `app/propose/
// actions.ts`'s own header names the exact quarter-hour this cost. Import the
// type from `./state` instead.

export async function makeSessionFromProposal(locale: Locale, proposalId: string): Promise<void> {
  if (!z.uuid().safeParse(proposalId).success) return;
  await createSessionFromProposal(locale, proposalId);
  revalidatePath(`/${locale}/app/admin/sessions`);
}

/** The message key for a failed field — same reasoning `app/propose/
 *  actions.ts`'s `errorKey()` gives: a member reading "too long" when the box
 *  was empty is told the wrong thing, so "missing" and the schema's other
 *  codes are different keys even where Zod raises one code for both. */
function errorKey(field: SessionField, code: string, empty: boolean): string {
  switch (field) {
    case "title":
      return empty ? "titleRequired" : code === "too_big" ? "titleTooLong" : "titleTooShort";
    case "abstract":
      return empty ? "abstractRequired" : "abstractTooLong";
    case "categoryId":
      return "categoryRequired";
    case "level":
      return "levelRequired";
    case "language":
      return "languageRequired";
    case "presenterIds":
      return "presentersInvalid";
    default:
      return "failed";
  }
}

export async function makeSessionDirectly(locale: Locale, prev: CreateSessionState, formData: FormData): Promise<CreateSessionState> {
  const captured = formStateFrom<SessionField>(formData, { fields: SESSION_VALUE_FIELDS, lists: ["presenterIds"], previous: prev });

  // `ui/combobox`'s own list is the only source of these ids, and the
  // same-org trigger refuses anything else at the write — parsing them here
  // just keeps a malformed value out of the RPC and out of what is handed
  // back, same reasoning `submitProposal`'s `coPresenters` filter gives.
  const presenterIds = wasList(captured, "presenterIds").filter((v) => z.uuid().safeParse(v).success);
  const state: CreateSessionState = { ...captured, lists: { presenterIds } };

  const raw = {
    title: was(state, "title"),
    abstract: was(state, "abstract"),
    categoryId: was(state, "categoryId"),
    level: was(state, "level"),
    language: was(state, "language"),
    presenterIds,
  };
  const parsed = directSessionInput.safeParse(raw);
  if (!parsed.success) return withErrors(state, zodErrors<SessionField>(parsed.error, errorKey, raw));

  let id: string;
  try {
    id = await createSessionDirect(locale, parsed.data);
  } catch {
    return withFormError(state, "failed");
  }
  revalidatePath(`/${locale}/app/admin/sessions`);
  // ★ Wave 21 (`DEC-228` §3.6): the admin lands on the new session's الجدولة —
  // scheduling is the next act (D13/D14) — instead of on `?created=<id>`, which
  // nothing ever read. `return` because next-intl's redirect is destructured,
  // so TypeScript does not read it as never-returning.
  return redirect({ href: `/app/admin/sessions/${id}/schedule`, locale });
}

export type TransitionState = { error: string | null; done: boolean };

/**
 * An admin's manual transition (REQ-SES-005). Every check that matters is in
 * `transition_session()`: it re-reads the caller against `claims_version`,
 * refuses anyone who is not a fresh admin of the session's own org, accepts
 * only 02 §6.2's edges, and refuses a cancellation with no written reason.
 * This action shapes the call and names the refusal.
 *
 * ★ `done` (new, wave 6): lets `session-controls.tsx` fire a toast on
 * success without inventing a second signal — same shape
 * `admin/proposals/actions.ts`'s `ReviewState.done` already established.
 */
export async function runTransition(locale: Locale, sessionId: string, _prev: TransitionState, formData: FormData): Promise<TransitionState> {
  const parsed = z
    .object({
      action: z.enum(["start", "complete", "cancel", "archive", "reopen"]),
      reason: z.string().trim().max(2000).nullable(),
    })
    .strict()
    .refine((v) => v.action !== "cancel" || (v.reason !== null && v.reason.length > 0), { path: ["reason"] })
    .safeParse({
      action: formData.get("action")?.toString() ?? "",
      reason: formData.get("reason")?.toString().trim() || null,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues.some((i) => i.path[0] === "reason") ? "cancelReasonRequired" : "actionFailed", done: false };
  }

  try {
    await transitionSession(locale, sessionId, parsed.data.action as SessionAction, parsed.data.reason);
  } catch {
    return { error: "actionFailed", done: false };
  }
  revalidatePath(`/${locale}/app/admin/sessions`);
  revalidatePath(`/${locale}/app/sessions/${sessionId}`);
  return { error: null, done: true };
}

/**
 * ★ Wave 21 — SCR-042's bulk «ألغِ الجلسات» (`DEC-228` §3.7, contract 7): the
 * SAME `transition_session()` the row's cancel calls, once per selected
 * session, with one written reason. Nothing is decided here that the RPC does
 * not decide again per row — a fresh admin of the session's own org, `02`
 * §6.2's edge, a non-empty reason — so a bulk cancel can do no more than the
 * single one. Sequential on purpose: Server Actions serialise per client, and
 * the parallel work lives inside this one action. A failure on one row does
 * not stop the others; the result names which failed, so the screen keeps
 * them selected.
 */
export async function runBulkCancel(locale: Locale, prev: BulkCancelState, formData: FormData): Promise<BulkCancelState> {
  const parsed = z
    .object({ ids: z.array(z.uuid()).min(1).max(100), reason: z.string().trim().min(1).max(2000) })
    .safeParse({ ids: formData.getAll("ids").map(String), reason: formData.get("reason")?.toString() ?? "" });
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some((i) => i.path[0] === "reason");
    return { error: reasonMissing ? "cancelReasonRequired" : "actionFailed", done: [], failed: [], attempt: prev.attempt + 1 };
  }

  const done: string[] = [];
  const failed: string[] = [];
  for (const id of [...new Set(parsed.data.ids)]) {
    try {
      await transitionSession(locale, id, "cancel", parsed.data.reason);
      done.push(id);
      revalidatePath(`/${locale}/app/sessions/${id}`);
    } catch {
      failed.push(id);
    }
  }
  revalidatePath(`/${locale}/app/admin/sessions`);
  return { error: null, done, failed, attempt: prev.attempt + 1 };
}
