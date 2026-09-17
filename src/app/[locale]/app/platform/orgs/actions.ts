"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createOrg,
  createOrgInput,
  deleteOrg,
  domainInput,
  reinstateOrg,
  suspendOrg,
} from "@/lib/dal/platform";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import {
  NEW_ORG_FIELDS,
  type DeleteState,
  type NewOrgField,
  type NewOrgState,
  type RowActionResult,
  type SuspendState,
} from "./state";

// SCR-080 and SCR-081's Server Actions — REQ-ADM-001, REQ-TEN-002, REQ-TEN-006,
// REQ-NFR-014. Zod first, then the DAL, which calls a `security definer` RPC
// that asserts the caller against `platform_admins`.
//
// Nothing here is the boundary: every one of these RPCs re-reads the table for
// `auth.uid()` (0005's `assert_platform_admin()`), so an action reached with a
// forged `platform_admin` claim is refused by Postgres, not by this file.
//
// ★ Every act answers (wave 8, notes W8.0 F4). Reinstating used to return
// `void`, so a refusal rendered nothing at all.

function newOrgErrorKey(field: NewOrgField, code: string, empty: boolean): string {
  switch (field) {
    case "name":
      return empty ? "nameRequired" : code === "too_big" ? "nameTooLong" : "nameTooShort";
    case "slug":
      return empty ? "slugRequired" : "slugInvalid";
    case "certificatePrefix":
      return empty ? "prefixRequired" : "prefixInvalid";
    case "domains":
      return empty ? "domains_required" : code === "too_big" ? "domainsTooMany" : "invalid_domain";
    default:
      return empty ? "emailRequired" : "invalid_email";
  }
}

export async function createOrgAction(locale: Locale, prev: NewOrgState, formData: FormData): Promise<NewOrgState> {
  const captured = formStateFrom<NewOrgField>(formData, { fields: NEW_ORG_FIELDS, lists: ["seedCategories"], previous: prev });

  // One per line is the honest input for a short list; a leading «@» is
  // forgiven, case is forgiven (the table stores lowercase — contract 4), and a
  // domain typed twice is one domain, not a unique-key failure.
  const domains = Array.from(
    new Set(
      was(captured, "domains")
        .split(/[\n,]/)
        .map((d) => d.trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean),
    ),
  );
  const raw = {
    name: was(captured, "name"),
    slug: was(captured, "slug"),
    certificatePrefix: was(captured, "certificatePrefix"),
    domains,
    firstAdminEmail: was(captured, "firstAdminEmail").trim(),
    seedCategories: formData.get("seedCategories") !== null,
  };
  const parsed = createOrgInput.safeParse(raw);
  const errors = parsed.success
    ? {}
    : zodErrors<NewOrgField>(parsed.error, newOrgErrorKey, {
        name: raw.name.trim(),
        slug: raw.slug.trim(),
        certificatePrefix: raw.certificatePrefix.trim(),
        domains: domains.length === 0 ? "" : "x",
        firstAdminEmail: raw.firstAdminEmail,
      });
  // `createOrgInput` checks a domain's length, not its shape; the table's check
  // would refuse a bad one as an opaque failure, so it is named here instead.
  if (!("domains" in errors) && domains.some((d) => !domainInput.safeParse(d).success)) {
    Object.assign(errors, { domains: "invalid_domain" });
  }
  if (!parsed.success || Object.keys(errors).length > 0) return withErrors(captured, errors);

  const result = await createOrg(locale, parsed.data);
  if (result.status === "failed") {
    if (result.message === "slug_taken") return withErrors(captured, { slug: "slug_taken" });
    if (result.message === "domains_required") return withErrors(captured, { domains: "domains_required" });
    return withFormError(captured, result.message);
  }

  revalidatePath(`/${locale}/app/platform/orgs`);
  // The org exists; its domains and first admin are the next thing to check,
  // so land there rather than on a list where the new row says nothing.
  redirect(`/${locale}/app/platform/orgs/${result.id}/domains`);
}

export async function suspendOrgAction(locale: Locale, orgId: string, prev: SuspendState, formData: FormData): Promise<SuspendState> {
  const captured = formStateFrom<"reason">(formData, { fields: ["reason"], previous: prev });
  if (was(captured, "reason").trim().length < 3) return withErrors(captured, { reason: "reason_required" });
  const result = await suspendOrg(locale, orgId, was(captured, "reason").trim());
  if (result.status === "failed") {
    return result.message === "reason_required" ? withErrors(captured, { reason: "reason_required" }) : withFormError(captured, result.message);
  }
  revalidatePath(`/${locale}/app/platform/orgs`);
  return { ...captured, attempt: 0 };
}

export async function reinstateOrgAction(locale: Locale, orgId: string): Promise<RowActionResult> {
  const result = await reinstateOrg(locale, orgId);
  if (result.status === "failed") return { error: result.message };
  revalidatePath(`/${locale}/app/platform/orgs`);
  return { error: null };
}

/**
 * REQ-NFR-014. The typed slug travels to the RPC, which compares it with the
 * stored one — a confirmation the server does not check is a dialog, not a
 * safety, and this is the one act in the product that cannot be undone.
 */
export async function deleteOrgAction(locale: Locale, orgId: string, prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const captured = formStateFrom<"confirmSlug">(formData, { fields: ["confirmSlug"], previous: prev });
  if (was(captured, "confirmSlug").trim() === "") return withErrors(captured, { confirmSlug: "confirmRequired" });
  const result = await deleteOrg(locale, orgId, was(captured, "confirmSlug"));
  if (result.status === "failed") {
    return result.message === "slug_mismatch" ? withErrors(captured, { confirmSlug: "slug_mismatch" }) : withFormError(captured, result.message);
  }
  revalidatePath(`/${locale}/app/platform/orgs`);
  return { ...captured, attempt: 0 };
}
