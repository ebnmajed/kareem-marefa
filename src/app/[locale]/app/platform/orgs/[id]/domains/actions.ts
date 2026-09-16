"use server";

import { revalidatePath } from "next/cache";
import { addDomain, domainInput, removeDomain, setFirstAdmin } from "@/lib/dal/platform";
import type { Locale } from "@/i18n/routing";
import { emptyFormState, formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import type { AddDomainState, FirstAdminState, RemoveDomainResult } from "./state";

// SCR-082's Server Actions — REQ-TEN-007, REQ-TEN-002, REQ-ADM-001.
//
// `org_domains` is admin-only including read (0004), and a super admin is not
// an admin of anything, so these go through `add_org_domain()` /
// `remove_org_domain()` — `security definer`, asserted against
// `platform_admins`, and audited by the table's own trigger as `platform_admin`.
//
// ★ Contract 4 (DEC-147): a domain reaches the table lowercase, with no leading
// «@» — `org_domains_normalise` runs BEFORE the check. So the form accepts any
// case, and what it reports back is the stored form, which is also what the
// list re-renders. Every act answers (notes W8.0 F4).

/** What `org_domains_normalise()` stores: trimmed, no leading «@», lowercase. */
const stored = (domain: string) => domain.trim().replace(/^@/, "").toLowerCase();

export async function addDomainAction(locale: Locale, orgId: string, prev: AddDomainState, formData: FormData): Promise<AddDomainState> {
  const captured = formStateFrom<"domain">(formData, { fields: ["domain"], previous: prev });
  const typed = was(captured, "domain");
  if (typed.trim() === "") return { ...withErrors(captured, { domain: "domain_required" }), done: null, stored: "" };
  if (!domainInput.safeParse(typed).success) return { ...withErrors(captured, { domain: "invalid_domain" }), done: null, stored: "" };

  const result = await addDomain(locale, orgId, typed);
  if (result.status === "failed") {
    return result.message === "invalid_domain"
      ? { ...withErrors(captured, { domain: "invalid_domain" }), done: null, stored: "" }
      : { ...withFormError(captured, result.message), done: null, stored: "" };
  }
  revalidatePath(`/${locale}/app/platform/orgs/${orgId}/domains`);
  // A fresh field for the next domain; the list below shows the stored row.
  return { ...emptyFormState<"domain">(), done: result.id ? "added" : "present", stored: stored(typed) };
}

/**
 * REQ-TEN-007: this prevents NEW provisioning only. Nobody is deprovisioned,
 * which the confirm dialog says before the press.
 */
export async function removeDomainAction(locale: Locale, orgId: string, domain: string): Promise<RemoveDomainResult> {
  const result = await removeDomain(locale, orgId, domain);
  if (result.status === "failed") return { error: result.message };
  revalidatePath(`/${locale}/app/platform/orgs/${orgId}/domains`);
  return { error: null };
}

export async function setFirstAdminAction(locale: Locale, orgId: string, prev: FirstAdminState, formData: FormData): Promise<FirstAdminState> {
  const captured = formStateFrom<"email">(formData, { fields: ["email"], previous: prev });
  if (was(captured, "email").trim() === "") return withErrors(captured, { email: "emailRequired" });
  const result = await setFirstAdmin(locale, orgId, was(captured, "email"));
  if (result.status === "failed") {
    return result.message === "invalid_email" ? withErrors(captured, { email: "invalid_email" }) : withFormError(captured, result.message);
  }
  revalidatePath(`/${locale}/app/platform/orgs/${orgId}/domains`);
  return { ...emptyFormState<"email">() };
}
