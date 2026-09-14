"use server";

import { revalidatePath } from "next/cache";
import { addDomain, removeDomain, setFirstAdmin } from "@/lib/dal/platform";
import type { Locale } from "@/i18n/routing";

// SCR-082's Server Actions — REQ-TEN-007, REQ-TEN-002.
//
// `org_domains` is admin-only including read (0004), and a super admin is not
// an admin of anything, so these go through `add_org_domain()` /
// `remove_org_domain()` — `security definer`, asserted against
// `platform_admins`, and audited by the table's own trigger as
// `platform_admin` rather than `system`.

export type DomainState = { error: string | null; ok: boolean };

export async function addDomainAction(locale: Locale, orgId: string, _prev: DomainState, formData: FormData): Promise<DomainState> {
  const result = await addDomain(locale, orgId, formData.get("domain")?.toString() ?? "");
  if (result.status === "failed") return { error: result.message, ok: false };
  revalidatePath(`/${locale}/app/platform/orgs/${orgId}/domains`);
  return { error: null, ok: true };
}

/**
 * REQ-TEN-007: this prevents NEW provisioning only. Nobody is deprovisioned,
 * which the screen says beside the control rather than in a tooltip — an
 * operator who expects removal to revoke access has removed the wrong thing.
 */
export async function removeDomainAction(locale: Locale, orgId: string, domain: string): Promise<void> {
  await removeDomain(locale, orgId, domain);
  revalidatePath(`/${locale}/app/platform/orgs/${orgId}/domains`);
}

export async function setFirstAdminAction(locale: Locale, orgId: string, _prev: DomainState, formData: FormData): Promise<DomainState> {
  const result = await setFirstAdmin(locale, orgId, formData.get("email")?.toString().trim() ?? "");
  if (result.status === "failed") return { error: result.message, ok: false };
  revalidatePath(`/${locale}/app/platform/orgs/${orgId}/domains`);
  return { error: null, ok: true };
}
