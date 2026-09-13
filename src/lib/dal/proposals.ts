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
export type NumeralSystem = "western" | "arabic";

export interface ProposalCategory {
  id: string;
  name: string;
}

export interface ProposalSummary {
  id: string;
  title: string;
  categoryName: string | null;
  level: ProposalLevel;
  state: ProposalState;
  /** The admin's written reason on a rejection or a change-request (REQ-PRO-005). Read-only here. */
  decisionReason: string | null;
  expectedDurationMinutes: number | null;
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

/** The org's numeral system (REQ-INT-006). Every numeral this track renders follows it. */
export async function getNumerals(locale: string): Promise<NumeralSystem> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("org_settings").select("numerals").eq("org_id", session.orgId).maybeSingle();
  if (error) throw new Error(`org_settings: ${error.message}`);
  return (data?.numerals as NumeralSystem) ?? "western";
}

/**
 * Creates a proposal, as a draft or straight to the admin's queue.
 *
 * No RPC: 03 §5.2b is explicit that the asymmetric using/with-check on
 * `proposals_update_own_editable` IS the state machine, and
 * `proposals_insert_own` already permits exactly `draft` and `submitted`. An
 * RPC here would re-implement a policy that already holds. The audit row
 * REQ-PRO-006 demands is written by a trigger, not by this call — see
 * supabase/proposed/sessions/0001_proposal_transitions.sql for why it has to
 * be a trigger.
 *
 * `decision_reason` is absent by construction, and absent from the column
 * grant too: a proposer cannot write their own rejection reason at any layer.
 */
export async function createProposal(locale: string, input: ProposalInput, submit: boolean): Promise<{ id: string; state: ProposalState }> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("proposals")
    .insert({
      org_id: session.orgId,
      proposer_id: session.memberId,
      title: input.title,
      abstract: input.abstract,
      category_id: input.categoryId,
      level: input.level,
      target_audience: input.targetAudience,
      expected_duration_minutes: input.expectedDurationMinutes,
      admin_notes: input.adminNotes,
      state: submit ? "submitted" : "draft",
    })
    .select("id, state")
    .single();
  if (error || !data) throw new Error(`proposals.insert: ${error?.message ?? "no row"}`);
  return { id: data.id, state: data.state as ProposalState };
}

/** One of the caller's own proposals, or null. Used by the post-submit confirmation. */
export async function getMyProposal(locale: string, id: string): Promise<ProposalSummary | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("proposals")
    .select("id, title, level, state, decision_reason, expected_duration_minutes, created_at, updated_at, categories(name)")
    .eq("id", id)
    .eq("proposer_id", session.memberId)
    .maybeSingle();
  if (error) throw new Error(`proposals.select: ${error.message}`);
  if (!data) return null;
  const category = data.categories as unknown as { name: string } | null;
  return {
    id: data.id,
    title: data.title,
    categoryName: category?.name ?? null,
    level: data.level as ProposalLevel,
    state: data.state as ProposalState,
    decisionReason: data.decision_reason,
    expectedDurationMinutes: data.expected_duration_minutes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
