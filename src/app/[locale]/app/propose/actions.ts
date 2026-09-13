"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createProposal, proposalInput, removeCoPresenter, respondToPresenterInvite } from "@/lib/dal/proposals";
import { z } from "zod";

// SCR-017's Server Action. Zod before anything else (REQ-NFR-002), then the
// DAL. Authority is not in the form: `org_id` and `proposer_id` come from the
// session inside the DAL, and `proposals_insert_own` refuses any other pair.
//
// ★ No date, time or venue is read from this FormData, because
// `proposalInput` is `.strict()` and has no such key — a smuggled field is a
// parse failure, not a dropped one (REQ-PRO-001).

export type ProposeState = {
  /** field name → message key under `proposals.propose.errors`. */
  errors: Record<string, string>;
  /** A whole-form failure, same key space. */
  formError: string | null;
};

export const emptyProposeState: ProposeState = { errors: {}, formError: null };

/**
 * The message key for a failed field.
 *
 * A member reading «العنوان قصير جدًا» when they left the box empty is being
 * told the wrong thing, so "missing" and "too short" are different keys even
 * though Zod raises one code for both.
 */
function errorKey(field: string, code: string, empty: boolean): string {
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

function optional(formData: FormData, name: string): string | null {
  const raw = formData.get(name)?.toString().trim();
  return raw ? raw : null;
}

export async function submitProposal(locale: Locale, _prev: ProposeState, formData: FormData): Promise<ProposeState> {
  const duration = optional(formData, "expectedDurationMinutes");
  const raw = {
    title: formData.get("title")?.toString() ?? "",
    abstract: formData.get("abstract")?.toString() ?? "",
    categoryId: formData.get("categoryId")?.toString() ?? "",
    level: formData.get("level")?.toString() ?? "",
    targetAudience: optional(formData, "targetAudience"),
    expectedDurationMinutes: duration === null ? null : Number(duration),
    adminNotes: optional(formData, "adminNotes"),
  };

  const parsed = proposalInput.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field in errors) continue;
      const value = raw[field as keyof typeof raw];
      errors[field] = errorKey(field, issue.code, value === null || value === "");
    }
    // The member's text stays in the form — a 2000-character abstract must
    // never be thrown away by a validation round trip.
    return { errors, formError: null };
  }

  // The picker's own list is the only source of these ids, and the same-org
  // trigger refuses anything else at the write; parsing them here just keeps
  // a malformed value out of the RPC.
  const coPresenters = formData.getAll("coPresenters").map(String).filter((v) => z.uuid().safeParse(v).success);

  const submit = formData.get("intent")?.toString() !== "draft";
  let created: { id: string };
  try {
    created = await createProposal(locale, parsed.data, submit, coPresenters);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("too_many_presenters")) return { errors: { coPresenters: "coPresentersTooMany" }, formError: null };
    if (message.includes("presenter_not_in_org")) return { errors: { coPresenters: "coPresentersUnknown" }, formError: null };
    return { errors: {}, formError: "failed" };
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
