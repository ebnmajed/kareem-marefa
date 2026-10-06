import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { attendanceRate } from "@/components/checkin/attendance-rate";
import { sessionClient, type Session } from "@/lib/dal/session";
import { getConsoleSessions } from "@/lib/dal/admin-sessions";
import { monthKeyOf, sortSessions, type ConsoleSessionRow } from "@/components/admin/sessions/session-query";

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
  /** `YYYY-MM` on the org's clock — the month every figure below counts (`DEC-228` §3.3). */
  month: string;
  timeZone: string;
  proposalPipeline: PipelineCounts;
  /** Sessions whose start falls in the month — the list `?month=` narrows to. */
  sessionsThisMonth: number;
  /** Confirmed reservations for the month's sessions. */
  rsvpsConfirmed: number;
  /** Check-ins (not removed) at the month's sessions. */
  checkInsTotal: number;
  /**
   * ★ `checkin`'s definition, the one attendance rate (`DEC-228` §3.4): members
   * checked in WHO HELD a confirmed reservation, over confirmed reservations, at
   * the month's sessions that have started. A walk-in is never inside it. Null
   * when there is nothing to divide by yet.
   */
  attendanceRate: number | null;
  /** Members whose status is active — a count of people, which a month does not narrow. */
  activeMembers: number;
  /** Positive ledger rows that occurred in the month; a reversal does not net against it. */
  pointsIssued: number;
  topPresenters: TopRow[];
  topCategories: TopRow[];
  topCompanies: TopRow[];
  /** The next sessions — a live one first, then by start (`ConsoleSessionRow`, SCR-042's own rows). */
  upcoming: ConsoleSessionRow[];
  /** `REQ-ADM-010`'s own enumeration — proposals, sessions, and the two
   *  `reports` targets kept SEPARATE rather than merged into one "open
   *  reports" figure, the same reasoning `DEC-005` gives for never merging a
   *  photo takedown queue with a photo report queue: two different screens,
   *  two different urgencies. Read through `getAdminAttention()` (contract 3),
   *  so the tiles and the rail's badges are one number. */
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

/** How many of the next sessions «القادمة» shows. */
export const UPCOMING_ROWS = 5;

/** One key per reservation or check-in across sessions — `checkin`'s `attendanceRate()` takes `session:member`. */
const pairKey = (r: { session_id: string; member_id: string }) => `${r.session_id}:${r.member_id}`;

/** SCR-040 — every figure below is meant to be clicked through: the page
 *  pairs each one with a link to the list it summarises (`REQ-ADM-004`'s own
 *  acceptance criterion — "a dashboard number nobody can open is a number
 *  nobody trusts", 09 §5). */
export async function getAdminDashboardData(locale: string, nowDate: Date = new Date()): Promise<DashboardData | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;
  const now = nowDate.getTime();

  const [
    { data: proposalRows, error: propErr },
    { data: memberRows, error: memErr },
    { data: ledgerRows, error: ledErr },
    { data: presenterRows, error: presErr },
    { data: categoryRows, error: catErr },
    attention,
    consoleSessions,
  ] = await Promise.all([
    supabase.from("proposals").select("state, created_at").eq("org_id", session.orgId),
    supabase.from("members").select("id, status").eq("org_id", session.orgId),
    supabase.from("points_ledger").select("amount, occurred_at").eq("org_id", session.orgId),
    supabase
      .from("session_presenters")
      // ★ 0215 (REQ-SES-023): `!inner` drops a slot whose session `sessions_read` hides — a deleted event counts for nobody.
      .select("member_id, accepted, members(id, display_name), sessions!inner(id)")
      .eq("org_id", session.orgId)
      .eq("accepted", true),
    supabase.from("sessions").select("category_id, categories(id, name)").eq("org_id", session.orgId).not("category_id", "is", null),
    getAdminAttention(locale),
    getConsoleSessions(locale, nowDate),
  ]);
  if (propErr) throw new Error(`proposals: ${propErr.message}`);
  if (memErr) throw new Error(`members: ${memErr.message}`);
  if (ledErr) throw new Error(`points_ledger: ${ledErr.message}`);
  if (presErr) throw new Error(`session_presenters: ${presErr.message}`);
  if (catErr) throw new Error(`sessions: ${catErr.message}`);
  if (!attention || !consoleSessions) return null;

  const { rows: sessions, timeZone } = consoleSessions;
  const month = monthKeyOf(nowDate.toISOString(), timeZone);
  const monthSessions = sessions.filter((s) => s.monthKey === month);
  const monthIds = monthSessions.map((s) => s.id);
  const startedIds = new Set(monthSessions.filter((s) => s.startsAt !== null && new Date(s.startsAt).getTime() <= now).map((s) => s.id));

  // The month's reservations and check-ins. A removed check-in (`0087`'s soft
  // delete) is not attendance: `remove_check_in()` reverses its points, and it
  // stops counting here the same way.
  const [{ data: rsvpRows, error: rsvpErr }, { data: checkInRows, error: ciErr }] = await Promise.all([
    monthIds.length
      ? supabase.from("rsvps").select("session_id, member_id").eq("org_id", session.orgId).eq("status", "confirmed").in("session_id", monthIds)
      : Promise.resolve({ data: [], error: null }),
    monthIds.length
      ? supabase.from("check_ins").select("session_id, member_id").eq("org_id", session.orgId).is("removed_at", null).in("session_id", monthIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rsvpErr) throw new Error(`rsvps: ${rsvpErr.message}`);
  if (ciErr) throw new Error(`check_ins: ${ciErr.message}`);
  const confirmed = (rsvpRows ?? []) as { session_id: string; member_id: string }[];
  const checkIns = (checkInRows ?? []) as { session_id: string; member_id: string }[];

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

  const activeMembers = (memberRows ?? []).filter((m) => m.status === "active").length;
  const pointsIssued = ((ledgerRows ?? []) as { amount: number; occurred_at: string }[])
    .filter((r) => monthKeyOf(r.occurred_at, timeZone) === month)
    .reduce((sum, r) => sum + Math.max(0, r.amount), 0);

  const row = (queue: string): AttentionRow => {
    const item = attention.items.find((i) => i.queue === queue);
    return { count: item?.count ?? 0, oldestAgeDays: item?.oldestAgeDays ?? null };
  };

  const presenterCounts = new Map<string, { label: string; count: number }>();
  for (const r of presenterRows ?? []) {
    const m = (r as unknown as { members: { id: string; display_name: string | null } | null }).members;
    if (!m) continue;
    const existing = presenterCounts.get(m.id);
    presenterCounts.set(m.id, { label: m.display_name ?? "", count: (existing?.count ?? 0) + 1 });
  }

  const categoryCounts = new Map<string, { label: string; count: number }>();
  for (const r of categoryRows ?? []) {
    const c = (r as unknown as { categories: { id: string; name: string } | null }).categories;
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
    .select("members!inner(company_id, companies(id, name)), sessions!inner(id)")
    .eq("org_id", session.orgId)
    .eq("accepted", true);
  if (compErr) throw new Error(`session_presenters: ${compErr.message}`);
  const companyCounts = new Map<string, { label: string; count: number }>();
  for (const r of companyPresenterRows ?? []) {
    const m = (r as unknown as { members: { company_id: string | null; companies: { id: string; name: string } | null } | null }).members;
    const c = m?.companies;
    if (!c) continue;
    const existing = companyCounts.get(c.id);
    companyCounts.set(c.id, { label: c.name, count: (existing?.count ?? 0) + 1 });
  }

  const upcoming = sortSessions(
    sessions.filter((s) => s.phase === "live" || s.phase === "open"),
    "default",
    "asc",
  ).slice(0, UPCOMING_ROWS);

  return {
    month,
    timeZone,
    proposalPipeline: pipeline,
    sessionsThisMonth: monthSessions.length,
    rsvpsConfirmed: confirmed.length,
    checkInsTotal: checkIns.length,
    // ★ THE attendance rate (`DEC-228` §3.4) — `checkin`'s one definition, over the month's started sessions.
    attendanceRate: attendanceRate(
      confirmed.filter((r) => startedIds.has(r.session_id)).map(pairKey),
      checkIns.filter((c) => startedIds.has(c.session_id)).map(pairKey),
    ).rate,
    activeMembers,
    pointsIssued,
    topPresenters: topN(presenterCounts, 5),
    topCategories: topN(categoryCounts, 5),
    topCompanies: topN(companyCounts, 5),
    upcoming,
    attention: {
      proposalsAwaitingDecision: row("proposals"),
      sessionsNotScheduled: row("unscheduledSessions"),
      openPhotoReports: row("photoReports"),
      openCommentReports: row("commentReports"),
    },
  };
}

// ── Contract 3 (wave 21, `DEC-227`, `DEC-228` §3.2) — what waits, for whom ──
//
// ONE read feeds the dashboard's «يحتاج انتباهك» tiles (`REQ-UIX-086`) and the
// console rail's badges (`REQ-UIX-084`: «a badge's count is read from the same
// source as the dashboard's attention tiles»). The predicates are the four
// `attention` rows above, moved verbatim, so a tile, its badge and the queue it
// opens can never disagree about a number.
//
// ★ Filtered by ROLE, at the data (`REQ-ADM-020`): a moderator reaches the
// moderation queues and neither the proposal queue nor scheduling, so a
// moderator gets the two report items and nothing else — a badge never leads
// to a page that 404s for its reader. A plain member gets `null`.
//
// ★ It never gates. The admin layout calls it for the badges and must not
// `notFound()` (its header says why: a layout's not-found streams a 200); the
// page that renders the tiles does its own check.
//
// ★ `cache()`: the layout and the dashboard page both call it in one request,
// and React's per-request cache makes that one set of queries, not two.

export type AttentionQueue = "proposals" | "unscheduledSessions" | "photoReports" | "commentReports";

export interface AttentionItem {
  queue: AttentionQueue;
  /** The `admin.shell.nav.*` key of the rail item whose screen IS this queue — the badge goes there (`DEC-228` §3.2). */
  navKey: "proposals" | "sessions" | "moderationReports" | "moderationPhotos";
  count: number;
  /** The oldest open item's age in whole days; `null` exactly when `count === 0`. */
  oldestAgeDays: number | null;
  /** The queue, narrowed to what `count` counts. */
  href: string;
}

export interface AdminAttention {
  /** In the artboard's order. An admin: all four. A moderator: `photoReports` and `commentReports`. */
  items: AttentionItem[];
  total: number;
}

/** The sessions list narrowed to undated sessions — the same predicate as `unscheduledSessions` below. */
export const UNSCHEDULED_SESSIONS_HREF = "/app/admin/sessions?month=none";

export const getAdminAttention = cache(async (locale: string): Promise<AdminAttention | null> => {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return null;
  const isAdmin = session.role === "admin";
  const now = Date.now();

  const none = Promise.resolve({ data: [] as { state?: string; created_at: string }[], error: null });
  const [proposals, unscheduled, photoReports, commentReports, takedowns] = await Promise.all([
    isAdmin ? supabase.from("proposals").select("state, created_at").eq("org_id", session.orgId).in("state", ["submitted", "in_review"]) : none,
    // Filtered in TS, as `getAdminDashboardData()` does — the same predicate, the same place.
    isAdmin ? supabase.from("sessions").select("state, created_at").eq("org_id", session.orgId).is("starts_at", null) : none,
    supabase.from("reports").select("photo_id, created_at").eq("org_id", session.orgId).eq("target", "photo").eq("status", "open"),
    supabase.from("reports").select("comment_id, created_at").eq("org_id", session.orgId).eq("target", "comment").eq("status", "open"),
    // ★ wave 22 (contract 5, `DEC-232` §4.6): a takedown request hides a photo until it is decided — it waits too, and
    // nothing counted it, so a hidden photo waited unseen.
    supabase.from("photo_takedowns").select("photo_id, requested_at").eq("org_id", session.orgId).is("resolved_at", null),
  ]);
  if (proposals.error) throw new Error(`proposals (attention): ${proposals.error.message}`);
  if (unscheduled.error) throw new Error(`sessions (attention): ${unscheduled.error.message}`);
  if (photoReports.error) throw new Error(`reports (photo attention): ${photoReports.error.message}`);
  if (commentReports.error) throw new Error(`reports (comment attention): ${commentReports.error.message}`);
  if (takedowns.error) throw new Error(`photo_takedowns (attention): ${takedowns.error.message}`);

  const ats = (rows: { created_at: string }[] | null) => (rows ?? []).map((r) => r.created_at);
  const item = (queue: AttentionQueue, navKey: AttentionItem["navKey"], href: string, createdAts: string[], count = createdAts.length): AttentionItem => ({
    queue,
    navKey,
    count,
    oldestAgeDays: count === 0 ? null : oldestAge(createdAts, now),
    href,
  });
  /** How many distinct things wait — a photo or comment reported three times is one decision (`DEC-232` §5.3). */
  const distinct = (rows: Record<string, string | null>[] | null, key: string) => new Set((rows ?? []).map((r) => r[key]).filter((v): v is string => !!v)).size;

  const items: AttentionItem[] = [];
  if (isAdmin) {
    items.push(item("proposals", "proposals", "/app/admin/proposals", ats(proposals.data as { created_at: string }[] | null)));
    const undated = ((unscheduled.data ?? []) as { state: string; created_at: string }[]).filter((r) => r.state !== "cancelled" && r.state !== "archived");
    items.push(item("unscheduledSessions", "sessions", UNSCHEDULED_SESSIONS_HREF, ats(undated)));
  }
  // ★ wave 22 (contract 5, `DEC-231` §5, content's written request): the queues follow the screens. الصور (`051`) holds
  // the open takedown requests AND the photo reports — counted as its two chips show them, so a photo in both counts in
  // both; البلاغات (`050/052`) holds the comment reports. The queue keys are unchanged, so the layout's badges follow.
  const photoRows = (photoReports.data ?? []) as { photo_id: string | null; created_at: string }[];
  const takedownRows = (takedowns.data ?? []) as { photo_id: string | null; requested_at: string }[];
  const photoCount = distinct(photoRows, "photo_id") + distinct(takedownRows, "photo_id");
  const photoHref = takedownRows.length === 0 && photoRows.length > 0 ? "/app/admin/moderation/photos?kind=reports" : "/app/admin/moderation/photos";
  items.push(item("photoReports", "moderationPhotos", photoHref, [...ats(photoRows), ...takedownRows.map((r) => r.requested_at)], photoCount));
  const commentRows = (commentReports.data ?? []) as { comment_id: string | null; created_at: string }[];
  items.push(item("commentReports", "moderationReports", "/app/admin/moderation/reports", ats(commentRows), distinct(commentRows, "comment_id")));

  return { items, total: items.reduce((sum, i) => sum + i.count, 0) };
});
