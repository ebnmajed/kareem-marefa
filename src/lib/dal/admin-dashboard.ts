import "server-only";
import { notFound } from "next/navigation";
import { sessionClient, type Session } from "@/lib/dal/session";

// SCR-040 · /app/admin — the org dashboard (REQ-ADM-004, D60).
//
// Every figure here is a plain aggregate over a table the admin's own RLS
// policy already lets them read (sessions, proposals, rsvps, check_ins,
// points_ledger, members — 03 §3's matrix) — there is nothing under
// `supabase/proposed/console/` for this screen: no view, no RPC, nothing to
// promote. Counting happens in this module rather than in Postgres because
// PostgREST's query builder has no `group by`, and an org's own row counts
// (sessions, proposals, members) are small enough that selecting the one or
// two columns a count needs and folding them in JS is simpler than adding a
// view for a single screen — the same call `venues.ts`'s `listVenuesForAdmin`
// already made for its own "upcoming sessions" count.

/** The admin console's staff gate, shared by every page under `/app/admin`.
 *  `admin/layout.tsx` calls it once; a plain member never reaches ANY admin
 *  route (`notFound()`, not a redirect — a member has no business knowing
 *  the console exists). A page that is admin-only on TOP of that (most of
 *  them) does its own narrower check, matching the existing
 *  `listVenuesForAdmin`/`getScoringAdminData` pattern of returning `null`
 *  for the page to 404 on. */
export async function requireStaffSession(locale: string): Promise<Session> {
  const { session } = await sessionClient(locale);
  if (session.role === "member") notFound();
  return session;
}

/** Admin-only pages call this instead: 404s a moderator too, same shape as
 *  `listVenuesForAdmin`'s `session.role !== "admin"` check, just centralised
 *  so every inherited/new admin-only page reads the same sentence. */
export async function requireAdminSession(locale: string): Promise<Session> {
  const session = await requireStaffSession(locale);
  if (session.role !== "admin") notFound();
  return session;
}

export interface PipelineCounts {
  draft: number;
  submitted: number;
  inReview: number;
  changesRequested: number;
  approved: number;
  rejected: number;
}

export interface TopRow {
  id: string;
  label: string;
  count: number;
}

/** One row of «يحتاج انتباهك» (`16` §6.7, `DEC-112`'s relocation from the
 *  withdrawn home page). `oldestAgeDays` is `null` only when `count` is 0 —
 *  there is nothing to be the oldest of. */
export interface AttentionRow {
  count: number;
  oldestAgeDays: number | null;
}

export interface DashboardData {
  proposalPipeline: PipelineCounts;
  rsvpsConfirmed: number;
  checkInsTotal: number;
  attendanceRate: number | null; // null when there is nothing to divide by yet
  activeMembers: number;
  pointsIssued: number;
  topPresenters: TopRow[];
  topCategories: TopRow[];
  topCompanies: TopRow[];
  /** `REQ-ADM-010`'s own enumeration — proposals, sessions, and the two
   *  `reports` targets kept SEPARATE rather than merged into one "open
   *  reports" figure, the same reasoning `DEC-005` gives for never merging a
   *  photo takedown queue with a photo report queue: two different screens,
   *  two different urgencies. A fifth item, "job-queue depth," was named in
   *  the spawn note and is deliberately NOT here — no org-scoped data source
   *  exists for it (`docs/plan/notes/console.md`'s Wave 6 §3), and the lead
   *  ruled it dropped rather than guessed at. */
  attention: {
    proposalsAwaitingDecision: AttentionRow;
    sessionsNotScheduled: AttentionRow;
    openPhotoReports: AttentionRow;
    openCommentReports: AttentionRow;
  };
}

function ageInDays(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

/** The oldest (smallest `created_at`) row's age, or `null` for an empty set —
 *  shared by every `AttentionRow` below so "oldest" always means the same
 *  thing: how long the FIRST one has been waiting, not the most recent. */
function oldestAge(createdAts: string[], now: number): number | null {
  if (createdAts.length === 0) return null;
  return Math.max(...createdAts.map((c) => ageInDays(c, now)));
}

const emptyPipeline: PipelineCounts = { draft: 0, submitted: 0, inReview: 0, changesRequested: 0, approved: 0, rejected: 0 };

function topN(counts: Map<string, { label: string; count: number }>, n: number): TopRow[] {
  return [...counts.entries()]
    .map(([id, v]) => ({ id, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** SCR-040 — every figure below is meant to be clicked through: the page
 *  pairs each one with a link to the list it summarises (`REQ-ADM-004`'s own
 *  acceptance criterion — "a dashboard number nobody can open is a number
 *  nobody trusts", 09 §5). */
export async function getAdminDashboardData(locale: string): Promise<DashboardData | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;

  const [
    { data: proposalRows, error: propErr },
    { data: rsvpRows, error: rsvpErr },
    { data: checkInRows, error: ciErr },
    { data: memberRows, error: memErr },
    { data: ledgerRows, error: ledErr },
    { data: presenterRows, error: presErr },
    { data: categoryRows, error: catErr },
    { data: unscheduledRows, error: unschedErr },
    { data: photoReportRows, error: photoRepErr },
    { data: commentReportRows, error: commentRepErr },
  ] = await Promise.all([
    // `created_at` added for the attention panel's "awaiting decision"
    // oldest-age figure — the pipeline counts below are unchanged.
    supabase.from("proposals").select("state, created_at").eq("org_id", session.orgId),
    supabase.from("rsvps").select("status, session_id, sessions!inner(starts_at)").eq("org_id", session.orgId).eq("status", "confirmed"),
    // `removed_at` (0087) is a soft delete — `remove_check_in()` reverses the
    // points award but the row stays for the audit trail. Excluded here so a
    // removed check-in stops counting toward the attendance rate, the same
    // way its points reversal already stops counting toward points issued.
    supabase.from("check_ins").select("id").eq("org_id", session.orgId).is("removed_at", null),
    supabase.from("members").select("id, status").eq("org_id", session.orgId),
    supabase.from("points_ledger").select("amount").eq("org_id", session.orgId),
    supabase
      .from("session_presenters")
      .select("member_id, accepted, members(id, display_name)")
      .eq("org_id", session.orgId)
      .eq("accepted", true),
    supabase.from("sessions").select("category_id, categories(id, name)").eq("org_id", session.orgId).not("category_id", "is", null),
    // «جلسات لم تُجدول بعد» — no start time yet. Filtered in JS below, not
    // with a PostgREST `not/in`, the same "small row counts, fold in JS"
    // call this module's own header comment already made for the pipeline.
    supabase.from("sessions").select("state, starts_at, created_at").eq("org_id", session.orgId).is("starts_at", null),
    // The two `reports` targets, kept as separate queries/rows rather than
    // one combined count — see `AttentionRow`'s own comment on `attention`.
    supabase.from("reports").select("created_at").eq("org_id", session.orgId).eq("target", "photo").eq("status", "open"),
    supabase.from("reports").select("created_at").eq("org_id", session.orgId).eq("target", "comment").eq("status", "open"),
  ]);
  if (propErr) throw new Error(`proposals: ${propErr.message}`);
  if (rsvpErr) throw new Error(`rsvps: ${rsvpErr.message}`);
  if (ciErr) throw new Error(`check_ins: ${ciErr.message}`);
  if (memErr) throw new Error(`members: ${memErr.message}`);
  if (ledErr) throw new Error(`points_ledger: ${ledErr.message}`);
  if (presErr) throw new Error(`session_presenters: ${presErr.message}`);
  if (catErr) throw new Error(`sessions: ${catErr.message}`);
  if (unschedErr) throw new Error(`sessions (unscheduled): ${unschedErr.message}`);
  if (photoRepErr) throw new Error(`reports (photo): ${photoRepErr.message}`);
  if (commentRepErr) throw new Error(`reports (comment): ${commentRepErr.message}`);

  const pipeline: PipelineCounts = { ...emptyPipeline };
  for (const r of proposalRows ?? []) {
    switch (r.state as string) {
      case "draft":
        pipeline.draft++;
        break;
      case "submitted":
        pipeline.submitted++;
        break;
      case "in_review":
        pipeline.inReview++;
        break;
      case "changes_requested":
        pipeline.changesRequested++;
        break;
      case "approved":
        pipeline.approved++;
        break;
      case "rejected":
        pipeline.rejected++;
        break;
    }
  }

  // "RSVPs vs check-ins" / attendance rate: only confirmed RSVPs for sessions
  // that have actually started count toward the denominator — a session
  // three weeks out with zero check-ins is not a no-show, it hasn't happened.
  const now = Date.now();
  const startedConfirmed = (rsvpRows ?? []).filter((r) => {
    const startsAt = (r as unknown as { sessions: { starts_at: string | null } | null }).sessions?.starts_at;
    return !!startsAt && new Date(startsAt).getTime() <= now;
  });
  const rsvpsConfirmed = (rsvpRows ?? []).length;
  const checkInsTotal = (checkInRows ?? []).length;
  const attendanceRate = startedConfirmed.length > 0 ? checkInsTotal / startedConfirmed.length : null;

  const activeMembers = (memberRows ?? []).filter((m) => m.status === "active").length;
  const pointsIssued = (ledgerRows ?? []).reduce((sum, r) => sum + Math.max(0, r.amount as number), 0);

  // «يحتاج انتباهك» — `REQ-ADM-010`'s own four queues.
  const awaitingDecisionAts = (proposalRows ?? []).filter((r) => r.state === "submitted" || r.state === "in_review").map((r) => r.created_at as string);
  const unscheduledAts = (unscheduledRows ?? [])
    .filter((r) => r.state !== "cancelled" && r.state !== "archived")
    .map((r) => r.created_at as string);
  const photoReportAts = (photoReportRows ?? []).map((r) => r.created_at as string);
  const commentReportAts = (commentReportRows ?? []).map((r) => r.created_at as string);
  const attention: DashboardData["attention"] = {
    proposalsAwaitingDecision: { count: awaitingDecisionAts.length, oldestAgeDays: oldestAge(awaitingDecisionAts, now) },
    sessionsNotScheduled: { count: unscheduledAts.length, oldestAgeDays: oldestAge(unscheduledAts, now) },
    openPhotoReports: { count: photoReportAts.length, oldestAgeDays: oldestAge(photoReportAts, now) },
    openCommentReports: { count: commentReportAts.length, oldestAgeDays: oldestAge(commentReportAts, now) },
  };

  const presenterCounts = new Map<string, { label: string; count: number }>();
  for (const row of presenterRows ?? []) {
    const m = (row as unknown as { members: { id: string; display_name: string | null } | null }).members;
    if (!m) continue;
    const existing = presenterCounts.get(m.id);
    presenterCounts.set(m.id, { label: m.display_name ?? "", count: (existing?.count ?? 0) + 1 });
  }

  const categoryCounts = new Map<string, { label: string; count: number }>();
  for (const row of categoryRows ?? []) {
    const c = (row as unknown as { categories: { id: string; name: string } | null }).categories;
    if (!c) continue;
    const existing = categoryCounts.get(c.id);
    categoryCounts.set(c.id, { label: c.name, count: (existing?.count ?? 0) + 1 });
  }

  // Top companies: by number of accepted presenter-slots their members hold
  // — a proxy for "which companies are showing up to present," the same
  // spirit REQ-ADM-004's "top companies" asks for. A second query rather
  // than folding into the presenter one above: that select already filters
  // to accepted=true and joins `members`, and company is one hop further.
  const { data: companyPresenterRows, error: compErr } = await supabase
    .from("session_presenters")
    .select("members!inner(company_id, companies(id, name))")
    .eq("org_id", session.orgId)
    .eq("accepted", true);
  if (compErr) throw new Error(`session_presenters: ${compErr.message}`);
  const companyCounts = new Map<string, { label: string; count: number }>();
  for (const row of companyPresenterRows ?? []) {
    const m = (row as unknown as { members: { company_id: string | null; companies: { id: string; name: string } | null } | null }).members;
    const c = m?.companies;
    if (!c) continue;
    const existing = companyCounts.get(c.id);
    companyCounts.set(c.id, { label: c.name, count: (existing?.count ?? 0) + 1 });
  }

  return {
    proposalPipeline: pipeline,
    rsvpsConfirmed,
    checkInsTotal,
    attendanceRate,
    activeMembers,
    pointsIssued,
    topPresenters: topN(presenterCounts, 5),
    topCategories: topN(categoryCounts, 5),
    topCompanies: topN(companyCounts, 5),
    attention,
  };
}
