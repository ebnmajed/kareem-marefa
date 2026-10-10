import "server-only";
import { cache } from "react";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { avatarHref } from "@/lib/dal/avatars";
import { getSessionPoster } from "@/lib/dal/posters";
import type { SessionState } from "@/lib/session-status";
import { EVENT_TYPES, eventTypeOf, type EventType } from "@/components/sessions/event-type";

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

export interface ProposalCategory {
  id: string;
  name: string;
}

export interface NameableMember {
  id: string;
  displayName: string | null;
  jobTitle: string | null;
  /** wave 19 (add-only): the company's colour, `#rrggbb` or null — the chosen chip's ring (REQ-UIX-043). */
  teamColor?: string | null;
}

export interface ProposalPresenter {
  memberId: string;
  displayName: string | null;
  /** The proposer's own row, which `create_proposal` writes accepted. */
  isProposer: boolean;
  accepted: boolean;
  declinedAt: string | null;
  /** wave 19 (add-only): our copy of the picture (DEC-099) and the company's colour for the ring. */
  avatarUrl?: string | null;
  teamColor?: string | null;
}

export interface ProposalSummary {
  id: string;
  title: string;
  abstract: string;
  categoryName: string | null;
  /** The category's id, so an edit can pre-select it. */
  categoryId: string;
  level: ProposalLevel;
  /** REQ-SES-022 (0213): the event type the proposer picked; the session made from it starts as this type. */
  eventType: EventType;
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
    /** REQ-SES-022: «نوع الفعالية» — a talk unless the proposer chose otherwise. */
    eventType: z.enum(EVENT_TYPES).default("talk"),
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
  /** A5 / OQ-021. The proposer is the (max + 1)th presenter, not an extra. */
  maxCoPresenters: number;
  /** OQ-018. A session happens in a room; its clock is the org's, not the reader's. */
  timeZone: string;
}

export async function getOrgPrefs(locale: string): Promise<OrgPrefs> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("org_settings").select("max_co_presenters, time_zone").eq("org_id", session.orgId).maybeSingle();
  if (error) throw new Error(`org_settings: ${error.message}`);
  return {
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
  const { data, error } = await supabase.from("members_member_view").select("id, display_name, job_title, company_id").neq("id", session.memberId).order("display_name");
  if (error) throw new Error(`members_member_view: ${error.message}`);
  const colours = await teamColours(supabase, (data ?? []).map((m) => m.company_id as string | null));
  return (data ?? []).map((m) => ({
    id: m.id,
    displayName: m.display_name,
    jobTitle: m.job_title,
    teamColor: m.company_id ? (colours.get(m.company_id as string) ?? null) : null,
  }));
}

/** Company id → `team_color` (0160), org-readable to every member (`companies_read`). One read. */
async function teamColours(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  companyIds: (string | null)[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(companyIds.filter((v): v is string => v !== null))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("companies").select("id, team_color").in("id", ids);
  if (error) throw new Error(`companies: ${error.message}`);
  return new Map((data ?? []).map((c) => [c.id as string, (c.team_color as string | null) ?? null]));
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
    // 0213's trailing parameter, by name.
    p_event_type: input.eventType ?? "talk",
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
    .select("id, display_name, company_id, avatar_version, avatar_key")
    .in("id", rows.map((r) => r.member_id));
  if (mErr) throw new Error(`members_member_view: ${mErr.message}`);
  const people = new Map(
    (members ?? []).map((m) => [m.id as string, m as { id: string; display_name: string | null; company_id: string | null; avatar_version: number | null; avatar_key?: string | null }]),
  );
  const colours = await teamColours(supabase, [...people.values()].map((m) => m.company_id));

  return rows.map((r) => {
    const m = people.get(r.member_id);
    return {
      memberId: r.member_id,
      displayName: m?.display_name ?? null,
      isProposer: r.member_id === proposerId,
      accepted: r.accepted,
      declinedAt: r.declined_at,
      avatarUrl: m ? avatarHref({ id: m.id, avatarVersion: m.avatar_version, avatarKey: m.avatar_key }, 96) : null,
      teamColor: m?.company_id ? (colours.get(m.company_id) ?? null) : null,
    };
  });
}

const PROPOSAL_COLUMNS = "id, title, abstract, proposer_id, category_id, level, event_type, state, decision_reason, expected_duration_minutes, created_at, updated_at, categories(name)";

type ProposalRow = {
  id: string;
  title: string;
  abstract: string;
  proposer_id: string;
  category_id: string;
  level: string;
  event_type?: string | null;
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
    categoryId: row.category_id,
    level: row.level as ProposalLevel,
    eventType: eventTypeOf(row.event_type),
    state: row.state as ProposalState,
    decisionReason: row.decision_reason,
    expectedDurationMinutes: row.expected_duration_minutes,
    presenters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** SCR-018's read: the summary plus the two fields only its own page shows. */
export interface ProposalDetail extends ProposalSummary {
  targetAudience: string | null;
  /** The proposer's note to the reviewer — returned to the PROPOSER only, never to a named co-presenter. */
  adminNotes: string | null;
}

/**
 * One proposal the caller can see, or null.
 *
 * Not filtered to `proposer_id`: REQ-PRO-008 gives a named co-presenter sight
 * of the proposal too, and `proposals_read_own_or_staff` already draws that
 * line. Adding an application filter here would take back what the policy
 * grants, and would hide the very row a co-presenter has to answer.
 *
 * ★ `admin_notes` is readable by a co-presenter at the row level — the policy
 * cannot hide one column — so the DTO withholds it: it is what the proposer
 * wrote to the reviewer, not to the people they named.
 */
export async function getProposal(locale: string, id: string): Promise<ProposalDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("proposals").select(`${PROPOSAL_COLUMNS}, target_audience, admin_notes`).eq("id", id).maybeSingle();
  if (error) throw new Error(`proposals.select: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ProposalRow & { target_audience: string | null; admin_notes: string | null };
  const summary = toSummary(row, await presentersOf(supabase, row.id, row.proposer_id), session.memberId);
  return { ...summary, targetAudience: row.target_audience, adminNotes: summary.viewerIsProposer ? row.admin_notes : null };
}

/** The states a proposer may edit in (`proposals_update_own_editable`, `0010`). */
export const EDITABLE_PROPOSAL_STATES: readonly ProposalState[] = ["draft", "changes_requested"];

/**
 * The proposer edits their own draft, or answers a change request
 * (REQ-PRO-005, REQ-PRO-006, SCR-018's edit path, DEC-141).
 *
 * What the database allows, and so what this asks for:
 *
 *   draft             → draft (save) or submitted (send)
 *   changes_requested → submitted, and only submitted: `0011`'s guard refuses
 *                       → draft, and the policy's `with check` refuses staying
 *                       in changes_requested
 *
 * `submit` is therefore forced for a change request by the caller, and a
 * refusal of any kind — a state that moved under the member, someone else's
 * proposal, a co-presenter — arrives as zero rows and becomes `not_editable`.
 * `decision_reason` is absent from the column grant, so the reason stays as
 * the reviewer wrote it; SCR-018 shows it only in the states it belongs to.
 * The transition's audit row and `MSG-proposal_submitted` are the existing
 * state triggers (`0011`, `0039`).
 */
export async function updateProposal(locale: string, id: string, input: ProposalInput, submit: boolean): Promise<{ id: string; state: ProposalState }> {
  if (!z.uuid().safeParse(id).success) throw new Error("not_editable");
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("proposals")
    .update({
      title: input.title,
      abstract: input.abstract,
      category_id: input.categoryId,
      level: input.level,
      target_audience: input.targetAudience,
      expected_duration_minutes: input.expectedDurationMinutes,
      admin_notes: input.adminNotes,
      event_type: input.eventType ?? "talk",
      state: submit ? "submitted" : "draft",
    })
    .eq("id", id)
    .select("id, state");
  if (error) {
    if (error.code === "23514" || error.code === "42501") throw new Error("not_editable");
    throw new Error(`proposals.update: ${error.message}`);
  }
  const row = data?.[0];
  if (!row) throw new Error("not_editable");
  return { id: row.id as string, state: row.state as ProposalState };
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

// ── Wave 19 (DEC-213, DEC-214) — what SCR-017 and SCR-018 read and write, add-only ─────────────────────────

/** The states a co-presenter may still join in — `proposal_presenters_addable()` (`0012:49-62`). */
export const OPEN_PROPOSAL_STATES: readonly ProposalState[] = ["draft", "submitted", "in_review", "changes_requested"];

export type AddCoPresentersOutcome = "ok" | "too_many" | "not_open" | "unknown_member" | "failed";

/**
 * The proposer names more co-presenters on their own proposal, after it was written (SCR-018's «+ أضف مُقدِّمًا
 * مشاركًا», DEC-213 §5.102, REQ-PRO-003).
 *
 * The database decides everything: `proposal_presenters_insert_by_proposer` (only the proposer),
 * `proposal_presenters_addable` (only while open), `presenters_within_limit` (the org's `max + 1`, every row
 * counted), `presenter_is_same_org`, and — from `0168` — `proposal_presenters_unanswered`, which writes every new
 * invitation unanswered whatever is sent. `accepted` is never sent here. Each insert fires
 * `MSG-copresenter_invited` exactly as `create_proposal()`'s do (`0039`). One statement, so a refusal adds nobody.
 */
export async function addCoPresenters(locale: string, proposalId: string, memberIds: readonly string[]): Promise<AddCoPresentersOutcome> {
  const ids = [...new Set(memberIds)].filter((id) => z.uuid().safeParse(id).success);
  if (!z.uuid().safeParse(proposalId).success || ids.length === 0) return "failed";
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("proposal_presenters")
    .insert(ids.filter((id) => id !== session.memberId).map((id) => ({ org_id: session.orgId, proposal_id: proposalId, member_id: id })));
  if (!error) return "ok";
  if (error.message.includes("too_many_presenters")) return "too_many";
  if (error.message.includes("proposal_not_open_for_presenters")) return "not_open";
  if (error.message.includes("presenter_not_in_org") || error.code === "23503") return "unknown_member";
  return "failed";
}

/** The session an approved proposal became, as SCR-018 shows it — «مُجدوَل» (DEC-213 §5.98, DEC-214 D15). */
export interface ProposalSessionLink {
  id: string;
  title: string;
  state: SessionState;
  /** ★ On the schedule: published or later. A draft the proposer can see as its presenter is NOT scheduled. */
  scheduled: boolean;
  posterUrl: string | null;
  posterWidth: number | null;
  posterHeight: number | null;
}

const SCHEDULED_SESSION_STATES = new Set(["published", "in_progress", "completed", "archived"]);

/**
 * The session whose `proposal_id` names this proposal (unique, `0020:18`), through `sessions_read` — or null.
 * The poster through `designer`'s `getSessionPoster()`, read only.
 */
export async function getProposalSession(locale: string, proposalId: string): Promise<ProposalSessionLink | null> {
  if (!z.uuid().safeParse(proposalId).success) return null;
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("sessions").select("id, title, state").eq("proposal_id", proposalId).maybeSingle();
  if (error) throw new Error(`sessions.select: ${error.message}`);
  if (!data) return null;
  const scheduled = SCHEDULED_SESSION_STATES.has(data.state as string);
  const poster = scheduled ? await getSessionPoster(locale, data.id as string).catch(() => null) : null;
  return {
    id: data.id as string,
    title: data.title as string,
    state: data.state as ProposalSessionLink["state"],
    scheduled,
    posterUrl: poster?.imageUrl ?? null,
    posterWidth: poster?.width ?? null,
    posterHeight: poster?.height ?? null,
  };
}

/** What proposing earns, read from the org's catalogue — SCR-017's earn panel (DEC-213 §5.96, contract 6). */
export interface ProposeEarnings {
  /** The presenter rules paid at completion and not variable, summed when enabled and positive; null when zero. */
  points: number | null;
  /** The enabled badge earned by a first delivered session, by its name; null when the org has none. */
  firstSessionBadge: string | null;
}

/**
 * ★ Every figure READ, never a literal: `proposal_accepted` and `session_delivered` — the two presenter rules a
 * proposer is paid at completion whatever happens in the room (`attendee_bonus`, `rating_bonus` and
 * `materials_uploaded` depend on it and are not promised). The badge is the one whose rule is a first delivered
 * session (`0027:546`), not retired. `scoring_rules` and `badges` are org-readable (`p1_org_read`).
 */
export async function getProposeEarnings(locale: string): Promise<ProposeEarnings> {
  const { session, supabase } = await sessionClient(locale);
  const [rules, badges] = await Promise.all([
    supabase.from("scoring_rules").select("points, enabled").eq("org_id", session.orgId).in("action_key", ["proposal_accepted", "session_delivered"]),
    supabase.from("badges").select("name, rule").eq("org_id", session.orgId).is("retired_at", null),
  ]);
  if (rules.error) throw new Error(`scoring_rules: ${rules.error.message}`);
  if (badges.error) throw new Error(`badges: ${badges.error.message}`);
  const sum = (rules.data ?? []).reduce((total, r) => total + (r.enabled === true && (r.points as number) > 0 ? (r.points as number) : 0), 0);
  const first = (badges.data ?? []).find((b) => {
    const rule = b.rule as { metric?: string; gte?: number } | null;
    return rule?.metric === "sessions_delivered_count" && rule.gte === 1;
  });
  return { points: sum > 0 ? sum : null, firstSessionBadge: (first?.name as string | undefined) ?? null };
}

// ── The admin review queue (SCR-041, REQ-PRO-005) ───────────────────────────

export interface ReviewItem extends ProposalSummary {
  targetAudience: string | null;
  adminNotes: string | null;
  proposerName: string | null;
  /** Whole days since it was submitted, for the queue's «منذ …». */
  ageDays: number;
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

// ── wave 21 · SCR-041 as a split view (add-only, REQ-UIX-088, DEC-228) ──────────────────────────────────────────────

/** The queue's filters, as the URL names them (`?state=`). An unknown value reads as `pending`. */
export type ProposalQueueFilter = "pending" | "changes" | "approved" | "all";

const FILTER_STATES: Record<ProposalQueueFilter, readonly ProposalState[]> = {
  pending: ["submitted", "in_review"],
  changes: ["changes_requested"],
  approved: ["approved"],
  all: ["submitted", "in_review", "changes_requested", "approved", "rejected"],
};

export function proposalQueueFilter(raw: string | string[] | undefined): ProposalQueueFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "changes" || value === "approved" || value === "all" ? value : "pending";
}

export function inProposalFilter(state: ProposalState, filter: ProposalQueueFilter): boolean {
  return FILTER_STATES[filter].includes(state);
}

/** One row of the queue — the title, who proposed it and from where, how long it has waited. */
export interface ProposalQueueItem {
  id: string;
  title: string;
  state: ProposalState;
  proposerName: string | null;
  companyName: string | null;
  /** Whole days since it last moved (`updated_at` — a resubmission resets it), for «منذ …». */
  ageDays: number;
}

export interface ProposalQueue {
  /** Every proposal past `draft`, oldest first — «a queue, not a feed». Filtered by the screen. */
  items: ProposalQueueItem[];
  counts: Record<ProposalQueueFilter, number>;
}

/**
 * The whole queue, once per request (a layout and a page both read it). Admin only, and enforced HERE — a moderator
 * may read proposals under `03` §5.2a but `09` §7.1 gives them no queue, and `review_proposal()` refuses them — so
 * `null` lets every route answer the streamed not-found (`DEC-134`). A draft is the proposer's alone and never listed.
 */
export const listProposalQueue = cache(async (locale: string): Promise<ProposalQueue | null> => {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;
  const { data, error } = await supabase
    .from("proposals")
    .select("id, title, state, proposer_id, updated_at")
    .neq("state", "draft")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`proposals.select: ${error.message}`);
  const rows = (data ?? []) as { id: string; title: string; state: ProposalState; proposer_id: string; updated_at: string }[];

  const proposerIds = [...new Set(rows.map((r) => r.proposer_id))];
  const people = new Map<string, { name: string | null; companyId: string | null }>();
  if (proposerIds.length > 0) {
    const { data: members, error: mErr } = await supabase.from("members_member_view").select("id, display_name, company_id").in("id", proposerIds);
    if (mErr) throw new Error(`members_member_view: ${mErr.message}`);
    for (const m of members ?? []) people.set(m.id as string, { name: (m.display_name as string | null) ?? null, companyId: (m.company_id as string | null) ?? null });
  }
  const companyIds = [...new Set([...people.values()].map((p) => p.companyId).filter((v): v is string => v !== null))];
  const companies = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: found, error: cErr } = await supabase.from("companies").select("id, name").in("id", companyIds);
    if (cErr) throw new Error(`companies: ${cErr.message}`);
    for (const c of found ?? []) companies.set(c.id as string, c.name as string);
  }

  const day = 24 * 60 * 60 * 1000;
  const items = rows.map((r) => {
    const person = people.get(r.proposer_id);
    return {
      id: r.id,
      title: r.title,
      state: r.state,
      proposerName: person?.name ?? null,
      companyName: person?.companyId ? (companies.get(person.companyId) ?? null) : null,
      ageDays: Math.max(0, Math.floor((Date.now() - new Date(r.updated_at).getTime()) / day)),
    };
  });
  const count = (filter: ProposalQueueFilter) => items.filter((i) => inProposalFilter(i.state, filter)).length;
  return { items, counts: { pending: count("pending"), changes: count("changes"), approved: count("approved"), all: items.length } };
});

/** One proposal as the reviewer reads it — every field the proposer wrote (REQ-PRO-002). */
export interface ProposalForReview {
  id: string;
  title: string;
  abstract: string;
  state: ProposalState;
  categoryName: string | null;
  level: ProposalLevel;
  /** REQ-SES-022: read-only here — the proposer's choice. */
  eventType: EventType;
  expectedDurationMinutes: number | null;
  targetAudience: string | null;
  adminNotes: string | null;
  /** The reason sent with a change-request or a rejection. */
  decisionReason: string | null;
  proposer: { memberId: string; displayName: string | null; avatarUrl: string | null; teamColor: string | null } | null;
  /** Accepted and pending co-presenters with the proposer; a DECLINED row is not a presenter (found at wave 21). */
  presenters: ProposalPresenter[];
  /** When it was first sent — the baseline audit row (`0179`), else when it was created. */
  submittedAt: string;
}

/** Admin only; `null` otherwise, for an unknown id, or for a draft. */
export async function getProposalForReview(locale: string, id: string): Promise<ProposalForReview | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;
  const { data, error } = await supabase.from("proposals").select(`${PROPOSAL_COLUMNS}, target_audience, admin_notes`).eq("id", id).neq("state", "draft").maybeSingle();
  if (error) throw new Error(`proposals.select: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ProposalRow & { target_audience: string | null; admin_notes: string | null };
  const presenters = (await presentersOf(supabase, row.id, row.proposer_id)).filter((p) => p.declinedAt === null);
  const proposer = presenters.find((p) => p.isProposer) ?? null;
  const { data: baseline } = await supabase
    .from("audit_log")
    .select("occurred_at, before")
    .eq("subject_type", "proposal")
    .eq("subject_id", row.id)
    .eq("action", "proposal.submitted");
  const first = (baseline ?? []).find((b) => b.before === null || (b.before as { state?: string }).state === "draft");
  const category = row.categories as { name: string } | null;
  return {
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    state: row.state as ProposalState,
    categoryName: category?.name ?? null,
    level: row.level as ProposalLevel,
    eventType: eventTypeOf(row.event_type),
    expectedDurationMinutes: row.expected_duration_minutes,
    targetAudience: row.target_audience,
    adminNotes: row.admin_notes,
    decisionReason: row.decision_reason,
    proposer: proposer ? { memberId: proposer.memberId, displayName: proposer.displayName, avatarUrl: proposer.avatarUrl ?? null, teamColor: proposer.teamColor ?? null } : null,
    presenters,
    submittedAt: (first?.occurred_at as string | undefined) ?? row.created_at,
  };
}

/** The content columns `0179` captures, in the order the diff lists them. */
export const PROPOSAL_EDIT_FIELDS = ["title", "abstract", "category_id", "level", "target_audience", "expected_duration_minutes", "admin_notes"] as const;
export type ProposalEditField = (typeof PROPOSAL_EDIT_FIELDS)[number];

/** One field that changed since the proposal was first sent — for the category, its NAMES, never ids. */
export interface ProposalEdit {
  field: ProposalEditField;
  before: string | null;
  after: string | null;
  /** The latest resubmission that changed it. */
  at: string;
}

/**
 * What changed since the proposal was first submitted (contract 5, `DEC-228` §2) — admin only, `null` otherwise.
 *
 * ★ The baseline is the ONE `proposal.submitted` row that left `draft` (no edge returns to draft, so it is unique and
 * no ordering finds it). ★ A proposal submitted before `0179` has a baseline with no content: there is nothing honest
 * to compare against, so the answer is `[]` and the screen draws nothing — never «unchanged» when we cannot know.
 * Each field's «when» is the latest resubmission whose `before` and `after` differ on it: rows from different
 * transactions, so their `occurred_at` order is real (the `created_at` trap is about rows written together).
 */
export async function getProposalEdits(locale: string, proposalId: string): Promise<ProposalEdit[] | null> {
  if (!z.uuid().safeParse(proposalId).success) return null;
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;
  const [rows, current] = await Promise.all([
    supabase.from("audit_log").select("occurred_at, before, after").eq("subject_type", "proposal").eq("subject_id", proposalId).eq("action", "proposal.submitted"),
    supabase.from("proposals").select(PROPOSAL_EDIT_FIELDS.join(", ")).eq("id", proposalId).maybeSingle(),
  ]);
  if (rows.error) throw new Error(`audit_log: ${rows.error.message}`);
  if (current.error) throw new Error(`proposals.select: ${current.error.message}`);
  if (!current.data) return null;
  type Snapshot = Partial<Record<ProposalEditField, unknown>> & { state?: string };
  const audit = (rows.data ?? []) as { occurred_at: string; before: Snapshot | null; after: Snapshot }[];
  const baseline = audit.find((r) => r.before === null || r.before.state === "draft");
  if (!baseline || !("abstract" in baseline.after)) return [];

  const now = current.data as unknown as Record<ProposalEditField, unknown>;
  const asText = (v: unknown) => (v === null || v === undefined ? null : String(v));
  const changed = PROPOSAL_EDIT_FIELDS.filter((f) => asText(baseline.after[f]) !== asText(now[f]));
  if (changed.length === 0) return [];

  const resubmissions = audit.filter((r) => r.before?.state === "changes_requested");
  const when = (field: ProposalEditField) =>
    resubmissions
      .filter((r) => asText(r.before?.[field]) !== asText(r.after[field]))
      .map((r) => r.occurred_at)
      .sort()
      .at(-1) ?? baseline.occurred_at;

  // A category is shown by name — both the old one and the new, which may since have been renamed or archived.
  const categoryIds = changed.includes("category_id") ? [asText(baseline.after.category_id), asText(now.category_id)].filter((v): v is string => v !== null) : [];
  const names = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: cats, error: cErr } = await supabase.from("categories").select("id, name").in("id", categoryIds);
    if (cErr) throw new Error(`categories: ${cErr.message}`);
    for (const c of cats ?? []) names.set(c.id as string, c.name as string);
  }
  const shown = (field: ProposalEditField, v: unknown) => {
    const text = asText(v);
    return field === "category_id" && text ? (names.get(text) ?? null) : text;
  };
  return changed.map((field) => ({ field, before: shown(field, baseline.after[field]), after: shown(field, now[field]), at: when(field) }));
}
