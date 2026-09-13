import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Sessions — REQ-SES-001 … REQ-SES-013, REQ-PRO-007, 02 §4.3, §6.2, 03 §5.2c/d.
//
// `sessions` has NO insert policy and NO insert grant, and its four-column
// update grant covers only title, abstract, level and language. Everything
// schedule-shaped — starts_at, venue, capacity, the deadlines, certificate
// mode and state — moves through an admin RPC and nowhere else. That is
// D13/D14 expressed as privileges rather than as UI: a presenter cannot set a
// date even by crafting a request.
//
// Every function goes through sessionClient(), and returns a DTO.

export type SessionState =
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "in_progress"
  | "completed"
  | "archived"
  | "cancelled";

export type SessionLevel = "introductory" | "intermediate" | "advanced";
export type SessionLanguage = "ar" | "en";

export interface SessionPresenterDto {
  memberId: string;
  displayName: string | null;
  accepted: boolean;
  declinedAt: string | null;
}

export interface AdminSession {
  id: string;
  title: string;
  state: SessionState;
  level: SessionLevel;
  language: SessionLanguage;
  /** Null until an admin schedules it (REQ-SES-001). */
  startsAt: string | null;
  fromProposal: boolean;
  presenters: SessionPresenterDto[];
  createdAt: string;
}

/** An approved proposal that has not become a session yet. */
export interface SchedulableProposal {
  id: string;
  title: string;
  categoryName: string | null;
  level: SessionLevel;
  presenterNames: string[];
}

async function namesFor(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  memberIds: string[],
): Promise<Map<string, string | null>> {
  if (memberIds.length === 0) return new Map();
  const { data, error } = await supabase.from("members_member_view").select("id, display_name").in("id", memberIds);
  if (error) throw new Error(`members_member_view: ${error.message}`);
  return new Map((data ?? []).map((m) => [m.id as string, m.display_name as string | null]));
}

/**
 * Every session an admin manages (SCR-042).
 *
 * Admin only, decided here: a moderator is `is_staff()` and `sessions_read`
 * therefore shows them drafts, but `09` §7.1 does not give them this screen.
 * Null lets the route 404 rather than render a console they cannot act in.
 */
export async function listSessionsForAdmin(locale: string): Promise<AdminSession[] | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;

  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, state, level, language, starts_at, proposal_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`sessions.select: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: presenters, error: pErr } = await supabase
    .from("session_presenters")
    .select("session_id, member_id, accepted, declined_at")
    .in("session_id", rows.map((r) => r.id));
  if (pErr) throw new Error(`session_presenters: ${pErr.message}`);
  const names = await namesFor(supabase, (presenters ?? []).map((p) => p.member_id));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    state: r.state as SessionState,
    level: r.level as SessionLevel,
    language: r.language as SessionLanguage,
    startsAt: r.starts_at,
    fromProposal: r.proposal_id !== null,
    presenters: (presenters ?? [])
      .filter((p) => p.session_id === r.id)
      .map((p) => ({ memberId: p.member_id, displayName: names.get(p.member_id) ?? null, accepted: p.accepted, declinedAt: p.declined_at })),
    createdAt: r.created_at,
  }));
}

/**
 * Approved proposals with no session yet (SCR-042's «جاهزة للجدولة»).
 *
 * Two reads and a filter rather than a `not.in` with an inline subquery:
 * PostgREST has no subqueries, and the alternative — a view — would be a
 * schema change for a list an admin reads once a week.
 */
export async function listSchedulableProposals(locale: string): Promise<SchedulableProposal[]> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return [];

  const { data, error } = await supabase.from("proposals").select("id, title, level, categories(name)").eq("state", "approved").order("updated_at");
  if (error) throw new Error(`proposals.select: ${error.message}`);
  const rows = (data ?? []) as unknown as { id: string; title: string; level: string; categories: { name: string } | null }[];
  if (rows.length === 0) return [];

  const { data: taken, error: tErr } = await supabase.from("sessions").select("proposal_id").not("proposal_id", "is", null);
  if (tErr) throw new Error(`sessions.select: ${tErr.message}`);
  const used = new Set((taken ?? []).map((s) => s.proposal_id as string));

  const free = rows.filter((r) => !used.has(r.id));
  if (free.length === 0) return [];

  const { data: presenters, error: pErr } = await supabase
    .from("proposal_presenters")
    .select("proposal_id, member_id")
    .in("proposal_id", free.map((r) => r.id))
    .eq("accepted", true);
  if (pErr) throw new Error(`proposal_presenters: ${pErr.message}`);
  const names = await namesFor(supabase, (presenters ?? []).map((p) => p.member_id));

  return free.map((r) => ({
    id: r.id,
    title: r.title,
    categoryName: r.categories?.name ?? null,
    level: r.level as SessionLevel,
    presenterNames: (presenters ?? []).filter((p) => p.proposal_id === r.id).map((p) => names.get(p.member_id) ?? ""),
  }));
}

/**
 * What an admin may set when creating a session out of nothing (REQ-PRO-007).
 *
 * ★ No date, no venue, no capacity, and `.strict()` so adding one is a parse
 * failure. Creating and scheduling are two acts (D13/D14, REQ-SES-001), and
 * `create_session()` has no parameter for any of them either.
 */
export const directSessionInput = z
  .object({
    title: z.string().trim().min(3).max(150),
    abstract: z.string().trim().min(1).max(2000),
    categoryId: z.uuid(),
    level: z.enum(["introductory", "intermediate", "advanced"]),
    language: z.enum(["ar", "en"]),
    presenterIds: z.array(z.uuid()).max(10),
  })
  .strict();
export type DirectSessionInput = z.infer<typeof directSessionInput>;

/** Turns an approved proposal into a draft session (REQ-PRO-007, REQ-SES-001). */
export async function createSessionFromProposal(locale: string, proposalId: string): Promise<string> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("create_session", { p_proposal: proposalId });
  if (error || !data) throw new Error(`create_session: ${error?.message ?? "no id"}`);
  return data as string;
}

/** Creates a session with no proposal behind it (REQ-PRO-007). */
export async function createSessionDirect(locale: string, input: DirectSessionInput): Promise<string> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("create_session", {
    p_title: input.title,
    p_abstract: input.abstract,
    p_category: input.categoryId,
    p_level: input.level,
    p_language: input.language,
    p_presenters: input.presenterIds,
  });
  if (error || !data) throw new Error(`create_session: ${error?.message ?? "no id"}`);
  return data as string;
}
