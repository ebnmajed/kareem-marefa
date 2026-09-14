"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSessionDirect, createSessionFromProposal, directSessionInput, transitionSession, type SessionAction } from "@/lib/dal/sessions";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

// SCR-042's Server Actions (REQ-PRO-007). Zod first, then the DAL.
//
// Authority lives in `create_session()`, which is SECURITY DEFINER and opens
// with assert_fresh_admin(): `sessions` has no insert policy and no insert
// grant, so there is no other way to make one and no way for this action to
// widen who may.

// The initial state lives in ./state.ts: a "use server" module may export
// async functions only, and Next 16 refuses a constant here at build time.
export type CreateSessionState = { error: string | null };

export async function makeSessionFromProposal(locale: Locale, proposalId: string): Promise<void> {
  if (!z.uuid().safeParse(proposalId).success) return;
  await createSessionFromProposal(locale, proposalId);
  revalidatePath(`/${locale}/app/admin/sessions`);
}

export async function makeSessionDirectly(locale: Locale, _prev: CreateSessionState, formData: FormData): Promise<CreateSessionState> {
  const parsed = directSessionInput.safeParse({
    title: formData.get("title")?.toString() ?? "",
    abstract: formData.get("abstract")?.toString() ?? "",
    categoryId: formData.get("categoryId")?.toString() ?? "",
    level: formData.get("level")?.toString() ?? "",
    language: formData.get("language")?.toString() ?? "",
    presenterIds: formData.getAll("presenterIds").map(String),
  });
  if (!parsed.success) return { error: "invalid" };

  let id: string;
  try {
    id = await createSessionDirect(locale, parsed.data);
  } catch {
    return { error: "failed" };
  }
  revalidatePath(`/${locale}/app/admin/sessions`);
  // `return` because next-intl's redirect is destructured, so TypeScript does
  // not read it as never-returning.
  return redirect({ href: { pathname: "/app/admin/sessions", query: { created: id } }, locale });
}

export type TransitionState = { error: string | null };

/**
 * An admin's manual transition (REQ-SES-005). Every check that matters is in
 * `transition_session()`: it re-reads the caller against `claims_version`,
 * refuses anyone who is not a fresh admin of the session's own org, accepts
 * only 02 §6.2's edges, and refuses a cancellation with no written reason.
 * This action shapes the call and names the refusal.
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
    return { error: parsed.error.issues.some((i) => i.path[0] === "reason") ? "cancelReasonRequired" : "actionFailed" };
  }

  try {
    await transitionSession(locale, sessionId, parsed.data.action as SessionAction, parsed.data.reason);
  } catch {
    return { error: "actionFailed" };
  }
  revalidatePath(`/${locale}/app/admin/sessions`);
  revalidatePath(`/${locale}/app/sessions/${sessionId}`);
  return { error: null };
}
