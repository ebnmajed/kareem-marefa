"use server";

import { revalidatePath } from "next/cache";
import { deactivateMember, reactivateMember, roleChangeInput, setMemberRole } from "@/lib/dal/admin-members";
import type { Locale } from "@/i18n/routing";

// SCR-049's Server Actions (REQ-ADM-009, REQ-TEN-005). Every write is a
// thin call into 0005's own RPCs (`set_member_role`, `deactivate_member`,
// `reactivate_member`) — `assert_fresh_admin()` inside each is the real
// gate, re-checked against `claims_version` on every call, exactly as
// `03` §1.3 describes. This module only shapes form data into their
// parameters and turns a raised identifier into a state the form can show.

export type RowState = { error: string | null };

export async function changeRole(locale: Locale, memberId: string, _prev: RowState, formData: FormData): Promise<RowState> {
  const parsed = roleChangeInput.safeParse({ memberId, role: formData.get("role")?.toString() });
  if (!parsed.success) return { error: "failed" };
  const { error } = await setMemberRole(locale, parsed.data);
  if (error) return { error };
  revalidatePath(`/${locale}/app/admin/members`);
  return { error: null };
}

export async function deactivate(locale: Locale, memberId: string, _prev: RowState, formData: FormData): Promise<RowState> {
  const reason = formData.get("reason")?.toString() ?? "";
  const { error } = await deactivateMember(locale, { memberId, reason });
  if (error) return { error };
  revalidatePath(`/${locale}/app/admin/members`);
  return { error: null };
}

/** No `useActionState` here, matching `admin/venues/actions.ts`'s
 *  `toggleVenue`: reactivation is a single idempotent click, not a decision
 *  that needs a reason surfaced back to the form. */
export async function reactivate(locale: Locale, memberId: string): Promise<void> {
  await reactivateMember(locale, memberId);
  revalidatePath(`/${locale}/app/admin/members`);
}
