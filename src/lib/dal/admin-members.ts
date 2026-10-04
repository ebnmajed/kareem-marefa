import "server-only";
import { z } from "zod";
import { matchesMemberQuery, MEMBERS_PAGE_SIZE, type MemberQuery } from "@/components/admin/members/member-query";
import { readAll } from "@/lib/dal/admin-paging";
import { avatarHref } from "@/lib/dal/avatars";
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
  /** ★ wave 25 (`DEC-244` §3): false for somebody an admin added who has not signed in yet. The
   *  binding itself (`members.auth_user_id`) is outside 0004's column grant and reaches no DTO —
   *  `admin_list_members()` derives this boolean and returns it instead. */
  hasSignedIn: boolean;
  /** The admin who added them, or null for everyone who arrived by signing in. */
  invitedBy: string | null;
}

async function requireAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

type AdminMemberRpcRow = {
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
  has_signed_in: boolean;
  invited_by: string | null;
};

/** ★ wave 22 (`DEC-232` §4.3): paged — the definer list returns a set, and PostgREST cut it at `max_rows` silently. */
async function readMembers(supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"]): Promise<AdminMemberRow[]> {
  const rows = await readAll<AdminMemberRpcRow>("admin_list_members", (from, to) => supabase.rpc("admin_list_members").order("id").range(from, to));
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
      hasSignedIn: m.has_signed_in,
      invitedBy: m.invited_by,
    }))
    .sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email, "ar"));
}

export async function listMembersForAdmin(locale: string): Promise<AdminMemberRow[] | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  return readMembers(client.supabase);
}

// ── SCR-049, wave 22 — the screen's own read (`REQ-UIX-096`, add-only) ─────────────────────────────────────────────
//
// What `AdminMembers.dc.html` draws beside the definer list: the avatar through the one resolver (`DEC-099` — never
// `members.avatar_url`), the company's team ring, the level the nightly evaluation stored and the balance
// (`points_balances`, org-readable), filtered, sorted and paged here. `listMembersForAdmin` above is unchanged for the
// three other screens that read it. ★ «آخر نشاط» is not here: nothing stores a member's last activity (`DEC-232` §4,
// carried to the owner).

export interface ConsoleMemberRow extends AdminMemberRow {
  avatarUrl: string | null;
  companyName: string | null;
  /** The company's colour, or null for a company with none; undefined for a member with no company — no ring. */
  teamColor: string | null | undefined;
  points: number;
  levelName: string | null;
}

export interface ConsoleMembers {
  rows: ConsoleMemberRow[];
  /** How many match the query, across every page. */
  total: number;
  page: number;
  pageCount: number;
  /** 1-based positions of the page's first and last row; 0 and 0 for none. */
  from: number;
  to: number;
  /** For the company chip: every company of the org, active first. */
  companies: { id: string; name: string }[];
  /** Active org admins — the last one's menu says why it cannot be demoted or deactivated (`REQ-ADM-009`). */
  activeAdmins: number;
}

export async function listMembersForConsole(locale: string, query: MemberQuery): Promise<ConsoleMembers | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const [members, extras, companies, balances, levels] = await Promise.all([
    readMembers(supabase),
    readAll("members", (from, to) => supabase.from("members").select("id, avatar_version").order("id").range(from, to)),
    readAll("companies", (from, to) => supabase.from("companies").select("id, name, team_color, deactivated_at").order("id").range(from, to)),
    readAll("points_balances", (from, to) => supabase.from("points_balances").select("member_id, total_points, current_level_id").order("member_id").range(from, to)),
    readAll("levels", (from, to) => supabase.from("levels").select("id, name, threshold_points").eq("org_id", session.orgId).order("id").range(from, to)),
  ]);

  const avatar = new Map(extras.map((m) => [m.id as string, m.avatar_version as number | string | null]));
  const company = new Map(companies.map((c) => [c.id as string, { name: c.name as string, teamColor: c.team_color as string | null }]));
  const balance = new Map(balances.map((b) => [b.member_id as string, { points: b.total_points as number, levelId: b.current_level_id as string | null }]));
  const level = new Map(levels.map((l) => [l.id as string, l.name as string]));
  // ★ A member the nightly evaluation has not reached — no balance row yet, or none stored — still holds the level
  // their balance meets: level 1 starts at 0, so «—» would be wrong for every new member (the lead's wave-22 finding).
  const ladder = [...levels].sort((a, b) => (b.threshold_points as number) - (a.threshold_points as number));
  const levelOf = (points: number, stored: string | null) =>
    (stored ? level.get(stored) : undefined) ?? (ladder.find((l) => (l.threshold_points as number) <= points)?.name as string | undefined) ?? null;

  const matching = members.filter((m) => matchesMemberQuery(m, query));
  const pageCount = Math.max(1, Math.ceil(matching.length / MEMBERS_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const slice = matching.slice((page - 1) * MEMBERS_PAGE_SIZE, page * MEMBERS_PAGE_SIZE);

  return {
    rows: slice.map((m) => {
      const c = m.companyId ? company.get(m.companyId) : undefined;
      const b = balance.get(m.id);
      return {
        ...m,
        avatarUrl: avatarHref({ id: m.id, avatarVersion: avatar.get(m.id) }, 96),
        companyName: c?.name ?? null,
        teamColor: c ? c.teamColor : undefined,
        points: b?.points ?? 0,
        levelName: levelOf(b?.points ?? 0, b?.levelId ?? null),
      };
    }),
    total: matching.length,
    page,
    pageCount,
    from: slice.length ? (page - 1) * MEMBERS_PAGE_SIZE + 1 : 0,
    to: (page - 1) * MEMBERS_PAGE_SIZE + slice.length,
    companies: companies
      .sort((a, b) => Number(a.deactivated_at !== null) - Number(b.deactivated_at !== null) || (a.name as string).localeCompare(b.name as string, "ar"))
      .map((c) => ({ id: c.id as string, name: c.name as string })),
    activeAdmins: members.filter((m) => m.role === "admin" && m.status === "active").length,
  };
}

const ROLE_CHANGE_ERRORS = ["last_admin", "not_an_admin", "member_not_found", "stale_claims"] as const;
const DEACTIVATE_ERRORS = ["reason_required", "cannot_deactivate_self", "not_an_admin", "member_not_found", "stale_claims"] as const;
type KnownError = (typeof ROLE_CHANGE_ERRORS)[number] | (typeof DEACTIVATE_ERRORS)[number] | "already_a_member" | "not_an_address" | "role_not_allowed" | "already_signed_in" | "company_other_org";

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

// ── wave 25 · M27 — adding a member by hand (`REQ-TEN-009`, `DEC-243`, `DEC-244`) ────────────────
//
// Thin calls into the RPCs the wave's migration builds, exactly as the three above are thin calls
// into 0005's. `assert_fresh_admin()` is the gate, the audit row is the RPC's, and the mail is
// enqueued there — so nothing here decides anything a caller could skip.
//
// ★ `role` is `moderator | member` at this edge too. The database refuses `admin` (`DEC-244` §5.4)
// and that refusal is the authority; this enum is the SHAPE, so a crafted call fails validation
// before it reaches a round trip — never instead of it.

const ADD_MEMBER_ERRORS = ["already_a_member", "not_an_address", "role_not_allowed", "not_an_admin", "stale_claims"] as const;
// `members_company_same_org` (0004) raises a sentence, not an identifier — the one error here
// that is not already a key, so it is mapped rather than passed through with a space in it.
const OTHER_ORG_COMPANY = "another org";
const UNBOUND_ERRORS = ["already_signed_in", "member_not_found", "not_an_admin", "stale_claims"] as const;

const email = z
  .string()
  .trim()
  .min(3)
  .max(320)
  // The same shape the RPC enforces. Deliberately not a full RFC 5322 parser: the address is
  // proved by the person signing in with it, not by this regex.
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const addMemberInput = z
  .object({
    email,
    displayName: optionalText(120),
    companyId: z.uuid().nullable().optional(),
    jobTitle: optionalText(120),
    role: z.enum(["moderator", "member"]),
  })
  .strict();
export type AddMemberInput = z.infer<typeof addMemberInput>;

export async function addMember(locale: string, input: AddMemberInput): Promise<{ error: string | null; memberId: string | null }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("add_member", {
    p_email: input.email,
    p_display_name: input.displayName ?? null,
    p_company: input.companyId ?? null,
    p_job_title: input.jobTitle ?? null,
    p_role: input.role,
  });
  if (error) {
    if (error.message.includes(OTHER_ORG_COMPANY)) return { error: "company_other_org", memberId: null };
    return { error: classify(error.message, ADD_MEMBER_ERRORS), memberId: null };
  }
  // `add_member` returns the whole row; the screen needs only its id.
  const row = data as { id?: string } | null;
  return { error: null, memberId: row?.id ?? null };
}

/** One line of «أضف عضوًا»'s pasted list, as the RPC reports it. */
export interface AddMemberLine {
  email: string;
  outcome: "added" | "already_a_member" | "not_an_address" | "role_not_allowed" | "failed";
  memberId?: string;
}

export const addMembersInput = z
  .object({
    // Validated per line by the RPC, which reports each one — so the array itself is only bounded.
    emails: z.array(z.string().trim()).min(1).max(200),
    companyId: z.uuid().nullable().optional(),
    role: z.enum(["moderator", "member"]),
  })
  .strict();
export type AddMembersInput = z.infer<typeof addMembersInput>;

export async function addMembers(locale: string, input: AddMembersInput): Promise<{ error: string | null; report: AddMemberLine[] }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("add_members", {
    p_emails: input.emails,
    p_company: input.companyId ?? null,
    p_role: input.role,
  });
  if (error) {
    if (error.message.includes(OTHER_ORG_COMPANY)) return { error: "company_other_org", report: [] };
    return { error: classify(error.message, ADD_MEMBER_ERRORS), report: [] };
  }
  // The RPC reports `sqlerrm` per failed line; map it to the identifiers the screen can say, and
  // never show a raw Postgres message to an admin.
  const report = ((data ?? []) as { email: string; outcome: string; member_id?: string }[]).map((line) => ({
    email: line.email,
    outcome: (ADD_MEMBER_ERRORS.find((k) => line.outcome.includes(k)) ?? (line.outcome === "added" ? "added" : "failed")) as AddMemberLine["outcome"],
    memberId: line.member_id,
  }));
  return { error: null, report };
}

export async function resendMemberInvitation(locale: string, memberId: string): Promise<{ error: string | null }> {
  if (!z.uuid().safeParse(memberId).success) return { error: "failed" };
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("resend_member_invitation", { p_member: memberId });
  if (error) return { error: classify(error.message, UNBOUND_ERRORS) };
  return { error: null };
}

/** A mistyped address is deleted, and only while it is unbound (`DEC-244` §7). Once the person has
 *  signed in the RPC refuses, and the way out is deactivation with its reason (`REQ-AUT-008`). */
export async function removeUnboundMember(locale: string, memberId: string): Promise<{ error: string | null }> {
  if (!z.uuid().safeParse(memberId).success) return { error: "failed" };
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("remove_unbound_member", { p_member: memberId });
  if (error) return { error: classify(error.message, UNBOUND_ERRORS) };
  return { error: null };
}
