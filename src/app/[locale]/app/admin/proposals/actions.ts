"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reviewProposal } from "@/lib/dal/proposals";
import type { Locale } from "@/i18n/routing";

// SCR-041's Server Action (REQ-PRO-005). Zod first, then the DAL.
//
// Authority is emphatically not here: `review_proposal()` is SECURITY
// DEFINER, so it re-reads the caller's member row against `claims_version`
// and refuses anyone who is not a fresh admin of the proposal's own org. This
// action's job is to shape the call and turn a database refusal into a
// message a person can read.

export type ReviewState = {
  error: string | null;
  done: boolean;
  /**
   * The reason as typed, handed back.
   *
   * ★ React 19 resets a form after its action resolves, so a rejection whose
   * reason was rejected for being empty — or which failed for any other
   * reason — would come back with the admin's paragraph gone. The textarea
   * reads its `defaultValue` from here.
   */
  reason: string;
};

const input = z
  .object({
    proposalId: z.uuid(),
    action: z.enum(["open", "approve", "reject", "request_changes"]),
    reason: z.string().trim().max(2000).nullable(),
  })
  .strict()
  // REQ-PRO-005: rejection and a change-request BOTH require a written reason.
  // Checked here so the admin gets a field message, and again in the RPC so
  // the rule holds for anything that never touches this form.
  .refine((v) => !(v.action === "reject" || v.action === "request_changes") || (v.reason !== null && v.reason.length > 0), {
    path: ["reason"],
  });

export async function decideProposal(locale: Locale, _prev: ReviewState, formData: FormData): Promise<ReviewState> {
  // The reason box is named for its own decision: the three buttons share one
  // form, so a single `reason` field would hand back whichever box came first.
  const action = formData.get("action")?.toString() ?? "";
  const typed = formData.get(`reason-${action}`)?.toString() ?? "";
  const parsed = input.safeParse({
    proposalId: formData.get("proposalId")?.toString() ?? "",
    action,
    reason: typed.trim() || null,
  });
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some((i) => i.path[0] === "reason");
    return { error: reasonMissing ? "reasonRequired" : "failed", done: false, reason: typed };
  }

  try {
    await reviewProposal(locale, parsed.data.proposalId, parsed.data.action, parsed.data.reason);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return { error: message.includes("reason_required") ? "reasonRequired" : "failed", done: false, reason: typed };
  }

  revalidatePath(`/${locale}/app/admin/proposals`);
  return { error: null, done: true, reason: "" };
}
