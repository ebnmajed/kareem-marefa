"use server";

import { revalidatePath } from "next/cache";
import { deactivateMember, reactivateMember, roleChangeInput, setMemberRole } from "@/lib/dal/admin-members";
import type { Locale } from "@/i18n/routing";

// SCR-049's Server Actions (REQ-ADM-009, REQ-TEN-005, REQ-UIX-096). Every write is a thin call into 0005's own RPCs —
// `set_member_role`, `deactivate_member`, `reactivate_member` — whose `assert_fresh_admin()` is the real gate, the
// last-admin guard and the audit row (`member.role_changed` · `member.deactivated` · `member.reactivated`). This module
// shapes arguments and turns a raised identifier into a state the screen can say.
//
// ★ wave 22 (`DEC-232` §3.1): every action answers with what happened — reactivation used to return nothing, and the
// screen toasted «أُعيد تفعيل العضوية» whatever the RPC said.

export type RowState = { error: string | null; done: boolean };

export async function changeRole(locale: Locale, memberId: string, role: string): Promise<RowState> {
  const parsed = roleChangeInput.safeParse({ memberId, role });
  if (!parsed.success) return { error: "failed", done: false };
  const { error } = await setMemberRole(locale, parsed.data);
  if (error) return { error, done: false };
  revalidatePath(`/${locale}/app/admin/members`);
  return { error: null, done: true };
}

export async function deactivate(locale: Locale, memberId: string, _prev: RowState, formData: FormData): Promise<RowState> {
  const reason = formData.get("reason")?.toString() ?? "";
  const { error } = await deactivateMember(locale, { memberId, reason });
  if (error) return { error, done: false };
  revalidatePath(`/${locale}/app/admin/members`);
  return { error: null, done: true };
}

export async function reactivate(locale: Locale, memberId: string): Promise<RowState> {
  const { error } = await reactivateMember(locale, memberId);
  if (error) return { error, done: false };
  revalidatePath(`/${locale}/app/admin/members`);
  return { error: null, done: true };
}
