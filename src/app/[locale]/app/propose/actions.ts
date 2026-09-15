"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createProposal, proposalInput, removeCoPresenter, respondToPresenterInvite } from "@/lib/dal/proposals";
import { formStateFrom, was, wasList, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { PROPOSAL_VALUE_FIELDS, type ProposalField, type ProposeState } from "./state";
import { z } from "zod";

// SCR-017's Server Action. Zod before anything else (REQ-NFR-002), then the
// DAL. Authority is not in the form: `org_id` and `proposer_id` come from the
// session inside the DAL, and `proposals_insert_own` refuses any other pair.
//
// ★ No date, time or venue is read from this FormData, because
// `proposalInput` is `.strict()` and has no such key — a smuggled field is a
// parse failure, not a dropped one (REQ-PRO-001). The capture list in
// `state.ts` has no key for one either, so a smuggled value is not even handed
// back to the form.
//
// ★ M9: the hand-rolled `values` / `coPresenters` carry-back is now
// `lib/form-state` (`16` §8.2 item 6). The behaviour is identical and the
// reason is unchanged — React 19 RESETS a form once its action resolves, so a
// 2000-character abstract would be thrown away by a validation round trip
// while the copy on screen promises «بياناتك ما زالت في النموذج».
// `tests/e2e/sessions-propose.spec.ts` found that; nothing else would have.

export type { ProposeState };

/**
 * The message key for a failed field.
 *
 * A member reading «العنوان قصير جدًا» when they left the box empty is being
 * told the wrong thing, so "missing" and "too short" are different keys even
 * though Zod raises one code for both.
 */
function errorKey(field: ProposalField, code: string, empty: boolean): string {
  switch (field) {
    case "title":
      return empty ? "titleRequired" : code === "too_big" ? "titleTooLong" : "titleTooShort";
    case "abstract":
      return code === "too_big" ? "abstractTooLong" : "abstractRequired";
    case "categoryId":
      return "categoryRequired";
    case "level":
      return "levelRequired";
    case "targetAudience":
      return "audienceTooLong";
    case "expectedDurationMinutes":
      return "durationInvalid";
    case "adminNotes":
      return "notesTooLong";
    default:
      return "failed";
  }
}

/** An optional text field: trimmed, and absent rather than empty. */
function blank(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export async function submitProposal(locale: Locale, prev: ProposeState, formData: FormData): Promise<ProposeState> {
  const captured = formStateFrom<ProposalField>(formData, {
    fields: PROPOSAL_VALUE_FIELDS,
    lists: ["coPresenters"],
    previous: prev,
  });

  // The picker's own list is the only source of these ids, and the same-org
  // trigger refuses anything else at the write; parsing them here just keeps a
  // malformed value out of the RPC — and out of what is handed back.
  const coPresenters = wasList(captured, "coPresenters").filter((v) => z.uuid().safeParse(v).success);
  const state: ProposeState = { ...captured, lists: { coPresenters } };

  const duration = was(state, "expectedDurationMinutes").trim();
  const raw = {
    title: was(state, "title"),
    abstract: was(state, "abstract"),
    categoryId: was(state, "categoryId"),
    level: was(state, "level"),
    targetAudience: blank(was(state, "targetAudience")),
    expectedDurationMinutes: duration === "" ? null : Number(duration),
    adminNotes: blank(was(state, "adminNotes")),
  };

  const parsed = proposalInput.safeParse(raw);
  // The member's text stays in the form — see the header.
  if (!parsed.success) return withErrors(state, zodErrors<ProposalField>(parsed.error, errorKey, raw));

  const submit = formData.get("intent")?.toString() !== "draft";
  let created: { id: string };
  try {
    created = await createProposal(locale, parsed.data, submit, coPresenters);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("too_many_presenters")) return withErrors(state, { coPresenters: "coPresentersTooMany" });
    if (message.includes("presenter_not_in_org")) return withErrors(state, { coPresenters: "coPresentersUnknown" });
    return withFormError(state, "failed");
  }

  // Outside the try: redirect() signals by throwing, and catching it here
  // would turn a success into «تعذّر حفظ مقترحك». `return` because next-intl's
  // redirect comes off a destructured object, so TypeScript does not apply
  // its never-return analysis to it and the function would look fall-through.
  return redirect({ href: { pathname: `/app/propose/${created.id}`, query: { created: "1" } }, locale });
}

/**
 * A named co-presenter answers their invitation (REQ-PRO-003).
 *
 * Authority is not in the form: the DAL scopes the write to the session's own
 * row, and `proposal_presenters_update_self` refuses any other. The proposal
 * id is only a filter — a caller naming someone else's invitation updates
 * nothing rather than updating them.
 */
export async function answerPresenterInvite(locale: Locale, proposalId: string, accept: boolean): Promise<void> {
  if (!z.uuid().safeParse(proposalId).success) return;
  await respondToPresenterInvite(locale, proposalId, accept);
  revalidatePath(`/${locale}/app/propose/${proposalId}`);
}

/** The proposer drops a co-presenter from their own proposal (REQ-PRO-003). */
export async function dropCoPresenter(locale: Locale, proposalId: string, memberId: string): Promise<void> {
  if (!z.uuid().safeParse(proposalId).success || !z.uuid().safeParse(memberId).success) return;
  await removeCoPresenter(locale, proposalId, memberId);
  revalidatePath(`/${locale}/app/propose/${proposalId}`);
}
