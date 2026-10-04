"use server";

import { revalidatePath } from "next/cache";
import {
  addMember,
  addMemberInput,
  addMembers,
  addMembersInput,
  deactivateMember,
  reactivateMember,
  removeUnboundMember,
  resendMemberInvitation,
  roleChangeInput,
  setMemberRole,
  type AddMemberLine,
} from "@/lib/dal/admin-members";
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

// ── wave 25 · M27 — «أضف عضوًا» (`REQ-TEN-009`, `REQ-UIX-113`, `DEC-243`, `DEC-244`) ──────────────
//
// Zod before anything else, then one call into the wave's RPC, which holds the authority: the
// admin check, the refusal of `admin`, the audit row and the mail. Nothing is decided here.

// A type, not a value: a "use server" module may export async functions and nothing else, so the
// empty state lives in `state.ts` beside `emptyRowState`.
export type AddState = { error: string | null; done: boolean; report: AddMemberLine[] };

/** One line or many: the sheet posts a textarea, and one address is the degenerate case of a list.
 *  Keeping ONE action means the single-address path and the pasted path cannot drift — the per-line
 *  report is what the screen renders either way (`REQ-UIX-113`). */
export async function addToOrg(locale: Locale, _prev: AddState, formData: FormData): Promise<AddState> {
  const raw = formData.get("emails")?.toString() ?? "";
  const emails = raw
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (emails.length === 0) return { error: "no_addresses", done: false, report: [] };

  const companyId = formData.get("companyId")?.toString() || null;
  const role = formData.get("role")?.toString() ?? "member";

  // One address: the richer form, which carries the name and the job title the list cannot.
  if (emails.length === 1) {
    const parsed = addMemberInput.safeParse({
      email: emails[0],
      displayName: formData.get("displayName")?.toString() ?? null,
      companyId,
      jobTitle: formData.get("jobTitle")?.toString() ?? null,
      role,
    });
    if (!parsed.success) return { error: "not_an_address", done: false, report: [] };
    const { error, memberId } = await addMember(locale, parsed.data);
    if (error) return { error, done: false, report: [] };
    revalidatePath(`/${locale}/app/admin/members`);
    return { error: null, done: true, report: [{ email: parsed.data.email, outcome: "added", memberId: memberId ?? undefined }] };
  }

  const parsed = addMembersInput.safeParse({ emails, companyId, role });
  if (!parsed.success) return { error: "failed", done: false, report: [] };
  const { error, report } = await addMembers(locale, parsed.data);
  if (error) return { error, done: false, report: [] };
  revalidatePath(`/${locale}/app/admin/members`);
  // `done` means the call landed, not that every line did — the report says which.
  return { error: null, done: true, report };
}

export async function resendInvitation(locale: Locale, memberId: string): Promise<RowState> {
  const { error } = await resendMemberInvitation(locale, memberId);
  if (error) return { error, done: false };
  return { error: null, done: true };
}

export async function removeUnbound(locale: Locale, memberId: string): Promise<RowState> {
  const { error } = await removeUnboundMember(locale, memberId);
  if (error) return { error, done: false };
  revalidatePath(`/${locale}/app/admin/members`);
  return { error: null, done: true };
}
