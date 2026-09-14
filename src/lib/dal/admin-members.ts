import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// SCR-049 · /app/admin/members — members and roles (REQ-ADM-009,
// REQ-TEN-005, REQ-AUT-007, REQ-AUT-008). D60 · D8.
//
// Every write goes through the RPCs 0005 already built and
// `tests/rls/rpcs.test.ts` (`POL-set_member_role`, `POL-deactivate_member`)
// already proves — the last-org-admin guard, the audit row, and the
// claims_version bump that makes the subject's own next privileged write
// see `stale_claims`, all live there and none of it is re-implemented here.
// The list read is new (`admin_list_members()`, `supabase/proposed/
// console/0001_admin_members.sql`): 0004's column grant hides `email` from
// EVERY reader but the member themselves — see that file's own header for
// why a wider grant is the wrong fix.

export interface AdminMemberRow {
  id: string;
  email: string;
  displayName: string | null;
  companyId: string | null;
  jobTitle: string | null;
  role: "admin" | "moderator" | "member";
  status: "active" | "deactivated";
  deactivatedAt: string | null;
  deactivatedReason: string | null;
  createdAt: string;
}

async function requireAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

export async function listMembersForAdmin(locale: string): Promise<AdminMemberRow[] | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { supabase } = client;

  const { data, error } = await supabase.rpc("admin_list_members");
  if (error) throw new Error(`admin_list_members: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    email: string;
    display_name: string | null;
    company_id: string | null;
    job_title: string | null;
    org_role: AdminMemberRow["role"];
    status: AdminMemberRow["status"];
    deactivated_at: string | null;
    deactivated_reason: string | null;
    created_at: string;
  }[];

  return rows
    .map((m) => ({
      id: m.id,
      email: m.email,
      displayName: m.display_name,
      companyId: m.company_id,
      jobTitle: m.job_title,
      role: m.org_role,
      status: m.status,
      deactivatedAt: m.deactivated_at,
      deactivatedReason: m.deactivated_reason,
      createdAt: m.created_at,
    }))
    .sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email, "ar"));
}

const ROLE_CHANGE_ERRORS = ["last_admin", "not_an_admin", "member_not_found", "stale_claims"] as const;
const DEACTIVATE_ERRORS = ["reason_required", "cannot_deactivate_self", "not_an_admin", "member_not_found", "stale_claims"] as const;
type KnownError = (typeof ROLE_CHANGE_ERRORS)[number] | (typeof DEACTIVATE_ERRORS)[number];

/** Every RPC below raises a plain identifier as its message (0005's own
 *  style — `raise exception 'last_admin' using errcode = '42501'`), so the
 *  known ones are picked out of `error.message` rather than left as one
 *  generic "failed," which is the only way REQ-ADM-009's last-admin guard
 *  reads as a real answer instead of a dead end. */
function classify(message: string, known: readonly string[]): KnownError | "failed" {
  const hit = known.find((k) => message.includes(k));
  return (hit as KnownError | undefined) ?? "failed";
}

export const roleChangeInput = z.object({ memberId: z.uuid(), role: z.enum(["admin", "moderator", "member"]) }).strict();
export type RoleChangeInput = z.infer<typeof roleChangeInput>;

export async function setMemberRole(locale: string, input: RoleChangeInput): Promise<{ error: string | null }> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("set_member_role", { p_member: input.memberId, p_role: input.role });
  if (error) return { error: classify(error.message, ROLE_CHANGE_ERRORS) };
  return { error: null };
}

export const deactivateInput = z.object({ memberId: z.uuid(), reason: z.string().trim().min(3).max(300) }).strict();
export type DeactivateInput = z.infer<typeof deactivateInput>;

export async function deactivateMember(locale: string, input: DeactivateInput): Promise<{ error: string | null }> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("deactivate_member", { p_member: input.memberId, p_reason: input.reason });
  if (error) return { error: classify(error.message, DEACTIVATE_ERRORS) };
  return { error: null };
}

export async function reactivateMember(locale: string, memberId: string): Promise<{ error: string | null }> {
  if (!z.uuid().safeParse(memberId).success) return { error: "failed" };
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("reactivate_member", { p_member: memberId });
  if (error) return { error: classify(error.message, DEACTIVATE_ERRORS) };
  return { error: null };
}
