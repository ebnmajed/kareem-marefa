import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Proposals — REQ-PRO-001 … REQ-PRO-008, 02 §4.3, 03 §5.2.
//
// ★ There is no date, time or venue in this file, and there must never be
// one. REQ-PRO-001 is a schema fact before it is a form rule: `public.
// proposals` has no such column (02 §4.3), `proposalInput` below has no such
// key, and tests/components/sessions/proposal-schema.test.ts fails the build
// if one appears. Scheduling starts at REQ-SES-001, on `sessions`, by an
// admin.
//
// Every function goes through sessionClient() — the session check is at the
// data, never in a layout — and returns a DTO, never a row.

export type ProposalLevel = "introductory" | "intermediate" | "advanced";
export type ProposalState = "draft" | "submitted" | "in_review" | "changes_requested" | "approved" | "rejected";
export type NumeralSystem = "western" | "arabic_indic";

export interface ProposalCategory {
  id: string;
  name: string;
}

export interface NameableMember {
  id: string;
  displayName: string | null;
  jobTitle: string | null;
}

export interface ProposalPresenter {
  memberId: string;
  displayName: string | null;
  /** The proposer's own row, which `create_proposal` writes accepted. */
  isProposer: boolean;
  accepted: boolean;
  declinedAt: string | null;
}

export interface ProposalSummary {
  id: string;
  title: string;
  abstract: string;
  categoryName: string | null;
  level: ProposalLevel;
  state: ProposalState;
  /** The admin's written reason on a rejection or a change-request (REQ-PRO-005). Read-only here. */
  decisionReason: string | null;
  expectedDurationMinutes: number | null;
  presenters: ProposalPresenter[];
  /** Whether the caller owns this proposal. Decided here, never in a component. */
  viewerIsProposer: boolean;
  /** Where the caller stands as a named co-presenter (REQ-PRO-003). */
  viewerInvite: "none" | "pending" | "accepted" | "declined";
  createdAt: string;
  updatedAt: string;
}

/**
 * What a member may set on their own proposal.
 *
 * The bounds mirror the table's own checks (0010) so a violation arrives as
 * a field error the member can act on, rather than as a 23514 from Postgres.
 * Validation checks shape, not authority: `proposer_id` and `org_id` are not
 * in here — they are re-derived from the session below, so a well-formed
 * object cannot name a row the caller does not own.
 *
 * `.strict()` is load-bearing: it makes an unknown key — a smuggled
 * `starts_at`, say — a parse failure rather than a silently dropped field.
 */
export const proposalInput = z
  .object({
    title: z.string().trim().min(3).max(150),
    abstract: z.string().trim().min(1).max(2000),
    categoryId: z.uuid(),
    level: z.enum(["introductory", "intermediate", "advanced"]),
    targetAudience: z.string().trim().max(300).nullable(),
    expectedDurationMinutes: z.int().min(15).max(480).nullable(),
    adminNotes: z.string().trim().max(2000).nullable(),
  })
  .strict();
export type ProposalInput = z.infer<typeof proposalInput>;

/** The org's active categories, for the proposal form's التصنيف select. */
export async function listCategories(locale: string): Promise<ProposalCategory[]> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("categories").select("id, name").is("deactivated_at", null).order("name");
  if (error) throw new Error(`categories: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

export interface OrgPrefs {
  /** REQ-INT-006. Every numeral this track renders follows it. */
  numerals: NumeralSystem;
  /** A5 / OQ-021. The proposer is the (max + 1)th presenter, not an extra. */
  maxCoPresenters: number;
  /** OQ-018. A session happens in a room; its clock is the org's, not the reader's. */
  timeZone: string;
}

export async function getOrgPrefs(locale: string): Promise<OrgPrefs> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("org_settings").select("numerals, max_co_presenters, time_zone").eq("org_id", session.orgId).maybeSingle();
  if (error) throw new Error(`org_settings: ${error.message}`);
  return {
    numerals: (data?.numerals as NumeralSystem) ?? "western",
    maxCoPresenters: data?.max_co_presenters ?? 4,
    timeZone: data?.time_zone ?? "Asia/Riyadh",
  };
}

/**
 * The members a proposer may name as مقدّمون مشاركون (REQ-PRO-003).
 *
 * `members_member_view` IS the member tier (A33), so this cannot leak an
 * email or a status into a picker. RLS scopes it to the org, and the
 * same-org trigger refuses anything else at the write — the filter here is
 * defence in depth, not the boundary.
 */
export async function listNameableMembers(locale: string): Promise<NameableMember[]> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("members_member_view").select("id, display_name, job_title").neq("id", session.memberId).order("display_name");
  if (error) throw new Error(`members_member_view: ${error.message}`);
  return (data ?? []).map((m) => ({ id: m.id, displayName: m.display_name, jobTitle: m.job_title }));
}

/**
 * Creates a proposal with its presenters, in one transaction.
 *
 * `create_proposal()` is SECURITY INVOKER, so RLS and the column grants are
 * still the boundary — `proposals_insert_own` decides, and the function is
 * not asked for a `proposer_id` or an `org_id` because it reads both from the
 * claims. It exists for ATOMICITY: a proposal, the proposer's own accepted
 * presenter row and each named co-presenter are three inserts, and three
 * PostgREST calls would be three transactions, so a bad co-presenter id would
 * leave a proposal with nobody presenting it.
 *
 * The audit row REQ-PRO-006 demands is written by a trigger rather than here —
 * see supabase/proposed/sessions/0001_proposal_transitions.sql for why it has
 * to be a trigger and not this call.
 *
 * `decision_reason` is absent by construction and absent from the column
 * grant: a proposer cannot write their own rejection reason at any layer.
 */
export async function createProposal(
  locale: string,
  input: ProposalInput,
  submit: boolean,
  coPresenterIds: string[] = [],
): Promise<{ id: string; state: ProposalState }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("create_proposal", {
    p_title: input.title,
    p_abstract: input.abstract,
    p_category: input.categoryId,
    p_level: input.level,
    p_target_audience: input.targetAudience,
    p_expected_duration_minutes: input.expectedDurationMinutes,
    p_admin_notes: input.adminNotes,
    p_co_presenters: coPresenterIds,
    p_submit: submit,
  });
  if (error || !data) throw new Error(`create_proposal: ${error?.message ?? "no id"}`);
  return { id: data as string, state: submit ? "submitted" : "draft" };
}

/**
 * The presenters of one proposal, with their display names.
 *
 * Two reads rather than an embedded select: `members_member_view` is a view,
 * and asking PostgREST to infer an embedding through it is a fragile way to
 * get a name. The view is also what keeps this at the member tier (A33).
 */
async function presentersOf(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  proposalId: string,
  proposerId: string,
): Promise<ProposalPresenter[]> {
  const { data, error } = await supabase
    .from("proposal_presenters")
    .select("member_id, accepted, declined_at")
    .eq("proposal_id", proposalId)
    .order("created_at");
  if (error) throw new Error(`proposal_presenters: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: members, error: mErr } = await supabase
    .from("members_member_view")
    .select("id, display_name")
    .in("id", rows.map((r) => r.member_id));
  if (mErr) throw new Error(`members_member_view: ${mErr.message}`);
  const names = new Map((members ?? []).map((m) => [m.id as string, m.display_name as string | null]));

  return rows.map((r) => ({
    memberId: r.member_id,
    displayName: names.get(r.member_id) ?? null,
    isProposer: r.member_id === proposerId,
    accepted: r.accepted,
    declinedAt: r.declined_at,
  }));
}

const PROPOSAL_COLUMNS = "id, title, abstract, proposer_id, level, state, decision_reason, expected_duration_minutes, created_at, updated_at, categories(name)";

type ProposalRow = {
  id: string;
  title: string;
  abstract: string;
  proposer_id: string;
  level: string;
  state: string;
  decision_reason: string | null;
  expected_duration_minutes: number | null;
  created_at: string;
  updated_at: string;
  categories: unknown;
};

function toSummary(row: ProposalRow, presenters: ProposalPresenter[], viewerId: string): ProposalSummary {
  const category = row.categories as { name: string } | null;
  const mine = presenters.find((p) => p.memberId === viewerId && !p.isProposer);
  return {
    abstract: row.abstract,
    viewerIsProposer: row.proposer_id === viewerId,
    viewerInvite: !mine ? "none" : mine.declinedAt ? "declined" : mine.accepted ? "accepted" : "pending",
    id: row.id,
    title: row.title,
    categoryName: category?.name ?? null,
    level: row.level as ProposalLevel,
    state: row.state as ProposalState,
    decisionReason: row.decision_reason,
    expectedDurationMinutes: row.expected_duration_minutes,
    presenters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * One proposal the caller can see, or null.
 *
 * Not filtered to `proposer_id`: REQ-PRO-008 gives a named co-presenter sight
 * of the proposal too, and `proposals_read_own_or_staff` already draws that
 * line. Adding an application filter here would take back what the policy
 * grants, and would hide the very row a co-presenter has to answer.
 */
export async function getProposal(locale: string, id: string): Promise<ProposalSummary | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("proposals").select(PROPOSAL_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`proposals.select: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ProposalRow;
  return toSummary(row, await presentersOf(supabase, row.id, row.proposer_id), session.memberId);
}

/**
 * Every proposal the caller can see: their own, and those naming them
 * (REQ-PRO-008). The policy decides which; this only orders them.
 */
export async function listMyProposals(locale: string): Promise<ProposalSummary[]> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("proposals").select(PROPOSAL_COLUMNS).order("created_at", { ascending: false });
  if (error) throw new Error(`proposals.select: ${error.message}`);
  const rows = (data ?? []) as unknown as ProposalRow[];
  return Promise.all(rows.map(async (row) => toSummary(row, await presentersOf(supabase, row.id, row.proposer_id), session.memberId)));
}

/**
 * A named co-presenter answers their own invitation (REQ-PRO-003).
 *
 * `proposal_presenters_update_self` scopes the write to the caller's own row
 * and the column grant covers only `accepted` and `declined_at`, so the
 * `member_id` filter here is defence in depth. A decline records itself
 * rather than deleting the row: the proposer has to see that somebody stepped
 * back, and removing them is the proposer's act, not a side effect.
 */
export async function respondToPresenterInvite(locale: string, proposalId: string, accept: boolean): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("proposal_presenters")
    .update(accept ? { accepted: true, declined_at: null } : { accepted: false, declined_at: new Date().toISOString() })
    .eq("proposal_id", proposalId)
    .eq("member_id", session.memberId);
  if (error) throw new Error(`proposal_presenters.update: ${error.message}`);
}

/** Removes a co-presenter from the caller's own proposal (REQ-PRO-003). */
export async function removeCoPresenter(locale: string, proposalId: string, memberId: string): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  if (memberId === session.memberId) throw new Error("removeCoPresenter: the proposer is not removable");
  const { error } = await supabase.from("proposal_presenters").delete().eq("proposal_id", proposalId).eq("member_id", memberId);
  if (error) throw new Error(`proposal_presenters.delete: ${error.message}`);
}

// ── The admin review queue (SCR-041, REQ-PRO-005) ───────────────────────────

export interface ReviewItem extends ProposalSummary {
  targetAudience: string | null;
  adminNotes: string | null;
  proposerName: string | null;
  /** Whole days since it was submitted, for the queue's «منذ …». */
  ageDays: number;
}

/**
 * The proposals waiting on an admin.
 *
 * Admin only, and enforced here rather than in the page: `03` §5.2a lets a
 * MODERATOR read proposals too (they are `is_staff()`), but `09` §7.1 gives a
 * moderator four screens and this is not one of them, and `review_proposal()`
 * refuses them anyway. Returning null lets the route 404 instead of showing a
 * queue whose every button would fail.
 */
export async function listProposalsForReview(locale: string): Promise<ReviewItem[] | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;

  const { data, error } = await supabase
    .from("proposals")
    .select(`${PROPOSAL_COLUMNS}, target_audience, admin_notes`)
    .in("state", ["submitted", "in_review"])
    .order("created_at", { ascending: true }); // oldest first: a queue, not a feed
  if (error) throw new Error(`proposals.select: ${error.message}`);

  const rows = (data ?? []) as unknown as (ProposalRow & { target_audience: string | null; admin_notes: string | null })[];
  const day = 24 * 60 * 60 * 1000;
  return Promise.all(
    rows.map(async (row) => {
      const presenters = await presentersOf(supabase, row.id, row.proposer_id);
      return {
        ...toSummary(row, presenters, session.memberId),
        targetAudience: row.target_audience,
        adminNotes: row.admin_notes,
        proposerName: presenters.find((p) => p.isProposer)?.displayName ?? null,
        ageDays: Math.max(0, Math.floor((Date.now() - new Date(row.updated_at).getTime()) / day)),
      };
    }),
  );
}

export type ReviewAction = "open" | "approve" | "reject" | "request_changes";

/**
 * Records an admin's decision (REQ-PRO-005).
 *
 * Every check that matters is inside `review_proposal()`: it re-reads the
 * member row against `claims_version` (03 §1.3) because a SECURITY DEFINER
 * function must not believe the claims it was handed, it scopes to the
 * actor's own org, and it refuses a decision with no written reason. This
 * wrapper only shapes the call.
 */
export async function reviewProposal(locale: string, proposalId: string, action: ReviewAction, reason: string | null): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("review_proposal", { p_proposal: proposalId, p_action: action, p_reason: reason });
  if (error) throw new Error(`review_proposal: ${error.message}`);
}
