"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getProposalSession, reviewProposal } from "@/lib/dal/proposals";
import { createSessionFromProposal } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";

// SCR-041's Server Action (REQ-PRO-005). Zod first, then the DAL.
//
// Authority is emphatically not here: `review_proposal()` is SECURITY
// DEFINER, so it re-reads the caller's member row against `claims_version`
// and refuses anyone who is not a fresh admin of the proposal's own org. This
// action's job is to shape the call and turn a database refusal into a
// message a person can read.

export type ReviewState = {
  /** `reasonRequired`, `approveWithMessage` (DEC-228 §4.1 — said at the box), or `failed`. */
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
  // ★ wave 21: ONE box, «رسالة للمقترِح», for all three decisions (AdminProposals.dc.html). The old two-box naming
  // hazard — a filled reason replaced by an empty one sharing its name — went with the second box.
  const action = formData.get("action")?.toString() ?? "";
  const typed = formData.get("reason")?.toString() ?? "";
  const parsed = input.safeParse({
    proposalId: formData.get("proposalId")?.toString() ?? "",
    action,
    reason: typed.trim() || null,
  });
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some((i) => i.path[0] === "reason");
    return { error: reasonMissing ? "reasonRequired" : "failed", done: false, reason: typed };
  }
  // ★ DEC-228 §4.1 (b): approval carries no message — `review_proposal('approve')` clears `decision_reason` and
  // `MSG-proposal_approved` reads it (`0013`, `0039:156`) — so a message typed and then «اعتمد» would be lost in
  // silence. Refused at the box instead; nothing typed is lost. Carrying it is (a), carried.
  if (parsed.data.action === "approve" && parsed.data.reason !== null) {
    return { error: "approveWithMessage", done: false, reason: typed };
  }

  try {
    await reviewProposal(locale, parsed.data.proposalId, parsed.data.action, parsed.data.reason);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return { error: message.includes("reason_required") ? "reasonRequired" : "failed", done: false, reason: typed };
  }

  // The queue is the LAYOUT's list as well as the page's detail: both refresh.
  revalidatePath(`/${locale}/app/admin/proposals`, "layout");
  return { error: null, done: true, reason: "" };
}

/**
 * «افتح كجلسة» (REQ-PRO-007, REQ-SES-001) — the same `create_session(p_proposal)` SCR-042's button calls
 * (`DEC-228` §3.11 keeps that one); authority is the RPC's (`assert_fresh_admin()`, an approved proposal, one session
 * per proposal, `0020`). A session that already exists is opened, not made twice. Lands on its الجدولة.
 */
export async function openAsSession(locale: Locale, proposalId: string): Promise<void> {
  if (!z.uuid().safeParse(proposalId).success) return;
  const existing = await getProposalSession(locale, proposalId);
  const id = existing?.id ?? (await createSessionFromProposal(locale, proposalId));
  revalidatePath(`/${locale}/app/admin/proposals`, "layout");
  revalidatePath(`/${locale}/app/admin/sessions`);
  return redirect({ href: `/app/admin/sessions/${id}/schedule`, locale });
}
