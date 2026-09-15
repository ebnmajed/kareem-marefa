"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createOrg,
  createOrgInput,
  deleteOrg,
  reinstateOrg,
  suspendOrg,
  type PlatformWriteResult,
} from "@/lib/dal/platform";
import type { Locale } from "@/i18n/routing";

// SCR-080 and SCR-081's Server Actions. Zod first, then the DAL, which calls
// a `security definer` RPC that asserts the caller against `platform_admins`.
//
// Nothing here is the boundary: every one of these RPCs re-reads the table for
// `auth.uid()` (0005's `assert_platform_admin()`), so an action reached with a
// forged `platform_admin` claim is refused by Postgres, not by this file.
//
// A "use server" module exports async functions and types alone — the initial
// states live in ./state.

export type OrgFormState = { error: string | null; ok: boolean };

export async function createOrgAction(locale: Locale, _prev: OrgFormState, formData: FormData): Promise<OrgFormState> {
  const parsed = createOrgInput.safeParse({
    name: formData.get("name")?.toString() ?? "",
    slug: formData.get("slug")?.toString() ?? "",
    certificatePrefix: formData.get("certificatePrefix")?.toString() ?? "",
    // One per line is the honest input for a list whose items are short and
    // whose count is usually one or two; a repeatable field would be four
    // controls to add two domains.
    domains: (formData.get("domains")?.toString() ?? "")
      .split(/[\n,]/)
      .map((d) => d.trim().replace(/^@/, ""))
      .filter(Boolean),
    firstAdminEmail: formData.get("firstAdminEmail")?.toString() ?? "",
    seedCategories: formData.get("seedCategories") !== null,
  });
  if (!parsed.success) return { error: "invalid", ok: false };

  const result = await createOrg(locale, parsed.data);
  if (result.status === "failed") return { error: result.message, ok: false };

  revalidatePath(`/${locale}/app/platform/orgs`);
  // The org exists; its domains and first admin are the next thing to check,
  // so land there rather than on a list where the new row says nothing.
  redirect(`/${locale}/app/platform/orgs/${result.id}/domains`);
}

export async function suspendOrgAction(locale: Locale, orgId: string, _prev: OrgFormState, formData: FormData): Promise<OrgFormState> {
  const reason = formData.get("reason")?.toString().trim() ?? "";
  if (reason.length < 3) return { error: "reason_required", ok: false };
  return finish(locale, await suspendOrg(locale, orgId, reason));
}

export async function reinstateOrgAction(locale: Locale, orgId: string): Promise<void> {
  await reinstateOrg(locale, orgId);
  revalidatePath(`/${locale}/app/platform/orgs`);
}

/**
 * REQ-NFR-014. The typed slug travels to the RPC, which compares it with the
 * stored one — a confirmation the server does not check is a dialog, not a
 * safety, and this is the one act in the product that cannot be undone.
 */
export async function deleteOrgAction(locale: Locale, orgId: string, _prev: OrgFormState, formData: FormData): Promise<OrgFormState> {
  const typed = formData.get("confirmSlug")?.toString() ?? "";
  return finish(locale, await deleteOrg(locale, orgId, typed));
}

function finish(locale: Locale, result: PlatformWriteResult): OrgFormState {
  if (result.status === "failed") return { error: result.message, ok: false };
  revalidatePath(`/${locale}/app/platform/orgs`);
  return { error: null, ok: true };
}
