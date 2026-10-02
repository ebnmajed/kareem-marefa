import "server-only";
import { cache } from "react";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { companyFractions } from "@/components/scoring/race-fractions";

// The four boards (SCR-027, SCR-028, `05` §6). All-time reads live from
// public.all_time_leaderboard() (opt-out enforced in the database, since
// points_balances' own RLS has no opt-out concept — see the migration
// header). Monthly and company read the most recent snapshot for the org
// — final once the period has closed, provisional until then —
// leaderboard_entries' own RLS already filters an opted-out member from
// anyone but themselves.

/** How many of an org's newest company snapshots are scanned to find the month's — a quarter's sits beside it. */
const SNAPSHOT_SCAN = 6;

/** Whether a snapshot's period is one calendar month — `YYYY-MM-01` to the next month's first. Pure, exported for its test. */
export function isMonthPeriod(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const [y, m, d] = start.split("-").map(Number);
  if (d !== 1) return false;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return end === next;
}

/** Whether a snapshot's period is one calendar quarter — Jan, Apr, Jul or Oct the first, three months on. Pure, exported. */
export function isQuarterPeriod(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const [y, m, d] = start.split("-").map(Number);
  if (d !== 1 || (m - 1) % 3 !== 0) return false;
  const endMonth = m + 3;
  const next = endMonth > 12 ? `${y + 1}-${String(endMonth - 12).padStart(2, "0")}-01` : `${y}-${String(endMonth).padStart(2, "0")}-01`;
  return end === next;
}

/** The newest snapshot whose period is a calendar month, from rows newest first. Pure, exported for its test. */
export function latestMonthly<T extends { period_start: string | null; period_end: string | null }>(rows: T[]): T | null {
  return rows.find((r) => isMonthPeriod(r.period_start, r.period_end)) ?? null;
}

export interface MemberBoardRow {
  memberId: string;
  displayName: string;
  rank: number;
  points: number;
  isSelf: boolean;
  /** wave 16 (add-only): the member's company, for `rank-row` — null without one. */
  company?: string | null;
  /** wave 16 (add-only): `companies.team_color` (0160), reaching the DOM only as `--team`. */
  teamColor?: string | null;
}

export interface CompanyBoardRow {
  companyId: string;
  companyName: string;
  rank: number;
  totalPoints: number;
  pointsPerActiveMember: number | null;
  /** wave 16 (add-only): `companies.team_color` (0160). */
  teamColor?: string | null;
  /** wave 16 (add-only): the viewer's own company — «فريقك». */
  isOwn?: boolean;
  /** wave 20, PR C (add-only, REQ-UIX-082): below the snapshot's frozen minimum of active members — «بلا ترتيب». */
  unranked?: boolean;
}

export interface Leaderboards {
  allTime: MemberBoardRow[];
  monthly: { rows: MemberBoardRow[]; periodStart: string; periodEnd: string; isFinal: boolean } | null;
  /** `periodStart` is wave 16's, add-only: the month a company snapshot belongs to. */
  company: { rows: CompanyBoardRow[]; isFinal: boolean; takenAt: string; periodStart: string | null } | null;
  companyMetric: "total_points" | "points_per_active_member";
  timeZone: string;
}

export async function getLeaderboards(locale: string): Promise<Leaderboards> {
  const { session, supabase } = await sessionClient(locale);

  const [allTimeRes, settingsRes, monthlySnapRes, companySnapRes, viewerRes] = await Promise.all([
    supabase.rpc("all_time_leaderboard"),
    supabase.from("org_settings").select("company_metric, time_zone").eq("org_id", session.orgId).maybeSingle(),
    supabase
      .from("leaderboard_snapshots")
      .select("id, period_start, period_end, is_final")
      .eq("org_id", session.orgId)
      .eq("kind", "monthly")
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // ★ wave 20, PR B (the lead's exception to add-only, DEC-219 §2 as corrected): the company race's quarter is a
    // `company` snapshot too, so «the newest» is chosen among the MONTH's — `latestMonthly()` reads the period.
    supabase
      .from("leaderboard_snapshots")
      .select("id, is_final, taken_at, period_start, period_end, min_active_members")
      .eq("org_id", session.orgId)
      .eq("kind", "company")
      .order("taken_at", { ascending: false })
      .limit(SNAPSHOT_SCAN),
    // wave 16 (add-only): the viewer's own company, for «فريقك» and moment 5's company bar.
    supabase.from("members").select("company_id").eq("id", session.memberId).maybeSingle(),
  ]);
  if (allTimeRes.error) throw new Error(`all_time_leaderboard: ${allTimeRes.error.message}`);
  const viewerCompanyId = (viewerRes.data?.company_id as string | null | undefined) ?? null;
  const companyMetric = (settingsRes.data?.company_metric as "total_points" | "points_per_active_member") ?? "points_per_active_member";

  type AllTimeRow = { member_id: string; rank: number; total_points: number };
  const allTimeRows = (allTimeRes.data ?? []) as AllTimeRow[];
  const memberIds = allTimeRows.map((r) => r.member_id);
  const { data: members } = memberIds.length
    ? await supabase.from("members").select("id, display_name, company_id").in("id", memberIds)
    : { data: [] as Array<{ id: string; display_name: string | null; company_id: string | null }> };
  const nameOf = new Map((members ?? []).map((m) => [m.id, m.display_name ?? ""]));
  const companyIdOf = new Map((members ?? []).map((m) => [m.id, (m.company_id as string | null) ?? null]));

  const allTime: MemberBoardRow[] = allTimeRows.map((r) => ({
    memberId: r.member_id,
    displayName: nameOf.get(r.member_id) ?? "",
    rank: r.rank,
    points: r.total_points,
    isSelf: r.member_id === session.memberId,
    company: null,
    teamColor: null,
  }));

  let monthly: Leaderboards["monthly"] = null;
  if (monthlySnapRes.data) {
    const { data: entries, error } = await supabase
      .from("leaderboard_entries")
      .select("member_id, rank, points")
      .eq("snapshot_id", monthlySnapRes.data.id)
      .order("rank");
    if (error) throw new Error(`leaderboard_entries (monthly): ${error.message}`);
    const ids = (entries ?? []).map((e) => e.member_id).filter((id): id is string => Boolean(id));
    const { data: monthlyMembers } = ids.length
      ? await supabase.from("members").select("id, display_name, company_id").in("id", ids)
      : { data: [] as Array<{ id: string; display_name: string | null; company_id: string | null }> };
    const monthlyNameOf = new Map((monthlyMembers ?? []).map((m) => [m.id, m.display_name ?? ""]));
    for (const m of monthlyMembers ?? []) companyIdOf.set(m.id, (m.company_id as string | null) ?? null);
    monthly = {
      periodStart: monthlySnapRes.data.period_start,
      periodEnd: monthlySnapRes.data.period_end,
      isFinal: monthlySnapRes.data.is_final,
      rows: (entries ?? [])
        .filter((e): e is { member_id: string; rank: number; points: number } => Boolean(e.member_id))
        .map((e) => ({
          memberId: e.member_id,
          displayName: monthlyNameOf.get(e.member_id) ?? "",
          rank: e.rank,
          points: e.points,
          isSelf: e.member_id === session.memberId,
          company: null,
          teamColor: null,
        })),
    };
  }

  if (companySnapRes.error) throw new Error(`leaderboard_snapshots (company): ${companySnapRes.error.message}`);
  const companySnap = latestMonthly((companySnapRes.data ?? []) as Array<{ id: string; is_final: boolean; taken_at: string; period_start: string | null; period_end: string | null; min_active_members: number | null }>);
  let company: Leaderboards["company"] = null;
  if (companySnap) {
    const { data: entries, error } = await supabase
      .from("leaderboard_entries")
      .select("company_id, rank, points, points_per_active_member")
      .eq("snapshot_id", companySnap.id)
      .order("rank");
    if (error) throw new Error(`leaderboard_entries (company): ${error.message}`);
    const ids = (entries ?? []).map((e) => e.company_id).filter((id): id is string => Boolean(id));
    const { data: companies } = ids.length
      ? await supabase.from("companies").select("id, name, team_color").in("id", ids)
      : { data: [] as Array<{ id: string; name: string; team_color: string | null }> };
    const companyNameOf = new Map((companies ?? []).map((c) => [c.id, c.name]));
    const companyColourOf = new Map((companies ?? []).map((c) => [c.id, (c.team_color as string | null) ?? null]));
    company = {
      isFinal: companySnap.is_final,
      takenAt: companySnap.taken_at,
      periodStart: companySnap.period_start ?? null,
      rows: (entries ?? [])
        .filter((e): e is { company_id: string; rank: number; points: number; points_per_active_member: number | null } => Boolean(e.company_id))
        .map((e) => ({
          companyId: e.company_id,
          companyName: companyNameOf.get(e.company_id) ?? "",
          rank: e.rank,
          totalPoints: e.points,
          pointsPerActiveMember: e.points_per_active_member,
          teamColor: companyColourOf.get(e.company_id) ?? null,
          isOwn: viewerCompanyId !== null && e.company_id === viewerCompanyId,
          unranked: isUnranked(companySnap.min_active_members, e.points, e.points_per_active_member),
        })),
    };
  }

  // wave 16 (add-only): each member row's company and its colour, for `rank-row` — one read for both boards.
  const boardCompanyIds = [...new Set([...companyIdOf.values()].filter((id): id is string => Boolean(id)))];
  if (boardCompanyIds.length > 0) {
    const { data: boardCompanies, error } = await supabase.from("companies").select("id, name, team_color").in("id", boardCompanyIds);
    if (error) throw new Error(`companies (boards): ${error.message}`);
    const byId = new Map((boardCompanies ?? []).map((c) => [c.id as string, { name: c.name as string, teamColor: (c.team_color as string | null) ?? null }]));
    const withCompany = (row: MemberBoardRow): MemberBoardRow => {
      const c = byId.get(companyIdOf.get(row.memberId) ?? "");
      return c ? { ...row, company: c.name, teamColor: c.teamColor } : row;
    };
    allTime.splice(0, allTime.length, ...allTime.map(withCompany));
    if (monthly) monthly.rows = monthly.rows.map(withCompany);
  }

  return { allTime, monthly, company, companyMetric, timeZone: settingsRes.data?.time_zone ?? "Asia/Riyadh" };
}

// ── Company points breakdown (post-launch — docs/plan/notes/scoring.md
// "Company points rules") ───────────────────────────────────────────────────
//
// The owner's three creditable rules (hosting, attendance %, presenting %)
// write to a separate append-only company_points_ledger — REQ-PTS-003's
// "explainable without asking anyone" extended to company scope: any
// member of a company can see exactly why it holds the points it holds,
// same shape as their own /app/me/points history. Scoped to the reading
// member's own company (members.company_id) — there is no "which company"
// picker on the leaderboards screen, only "your company's own breakdown",
// same restraint SCR-022 uses for an individual member.

export interface CompanyLedgerRow {
  id: string;
  occurredAt: string;
  amount: number;
  reason: string;
  source: "company_hosting" | "company_attendance_pct" | "company_presenting_pct";
  sessionId: string | null;
  sessionTitle: string | null;
  meta: { attended?: number; presenting?: number; active_members?: number; percent?: number } | null;
}

export interface CompanyRuleCatalogueEntry {
  actionKey: "company_hosting" | "company_attendance_pct" | "company_presenting_pct";
  enabled: boolean;
  reasonAr: string;
  points: number | null;
  pointsPerPercent: number | null;
  capPoints: number | null;
  minActiveMembers: number | null;
}

export interface CompanyPointsBreakdown {
  companyId: string;
  companyName: string;
  totalPoints: number;
  rows: CompanyLedgerRow[];
  catalogue: CompanyRuleCatalogueEntry[];
}

export async function getCompanyPointsBreakdown(locale: string): Promise<CompanyPointsBreakdown | null> {
  const { session, supabase } = await sessionClient(locale);

  const { data: member, error: memberError } = await supabase.from("members").select("company_id").eq("id", session.memberId).maybeSingle();
  if (memberError) throw new Error(`members: ${memberError.message}`);
  if (!member?.company_id) return null;

  const [{ data: company, error: companyError }, { data: balance }, { data: rows, error: rowsError }, { data: rules, error: rulesError }] =
    await Promise.all([
      supabase.from("companies").select("id, name").eq("id", member.company_id).maybeSingle(),
      supabase.from("company_points_balances").select("total_points").eq("company_id", member.company_id).maybeSingle(),
      supabase
        .from("company_points_ledger")
        .select("id, occurred_at, amount, reason, source, session_id, meta, sessions(title)")
        .eq("company_id", member.company_id)
        .order("occurred_at", { ascending: false })
        .limit(200),
      supabase
        .from("company_scoring_rules")
        .select("action_key, enabled, reason_ar, points, points_per_percent, cap_points, min_active_members")
        .eq("org_id", session.orgId)
        .order("action_key"),
    ]);
  if (companyError) throw new Error(`companies: ${companyError.message}`);
  if (rowsError) throw new Error(`company_points_ledger: ${rowsError.message}`);
  if (rulesError) throw new Error(`company_scoring_rules: ${rulesError.message}`);
  if (!company) return null;

  type LedgerJoinRow = {
    id: string;
    occurred_at: string;
    amount: number;
    reason: string;
    source: CompanyLedgerRow["source"];
    session_id: string | null;
    meta: CompanyLedgerRow["meta"];
    sessions: { title: string } | { title: string }[] | null;
  };
  const titleOf = (s: LedgerJoinRow["sessions"]): string | null => (Array.isArray(s) ? (s[0]?.title ?? null) : (s?.title ?? null));

  return {
    companyId: company.id,
    companyName: company.name,
    totalPoints: balance?.total_points ?? 0,
    rows: ((rows ?? []) as LedgerJoinRow[]).map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at,
      amount: r.amount,
      reason: r.reason,
      source: r.source,
      sessionId: r.session_id,
      sessionTitle: titleOf(r.sessions),
      meta: r.meta,
    })),
    catalogue: (rules ?? []).map((r) => ({
      actionKey: r.action_key as CompanyRuleCatalogueEntry["actionKey"],
      enabled: r.enabled,
      reasonAr: r.reason_ar,
      points: r.points,
      pointsPerPercent: r.points_per_percent,
      capPoints: r.cap_points,
      minActiveMembers: r.min_active_members,
    })),
  };
}

// ── One member's standing, for their profile (SCR-020, wave 7, add-only) ────

export interface MemberStanding {
  totalPoints: number;
  /** The all-time rank — `null` when the board does not show them to this viewer (REQ-LDR-008). */
  rank: number | null;
  levelName: string | null;
}

/**
 * A member's points, level and all-time rank — A33's «النقاط والترتيب» and
 * «المستوى», which every tier sees.
 *
 * The rank comes from `all_time_leaderboard()` and nowhere else, so an
 * opted-out member has no rank for anyone but themselves — the database's rule
 * (0044), not this function's. Whether their POINTS are shown on a profile is
 * the profile reader's decision (`getMemberProfileForViewer`, DEC-141 ruling 5).
 */
export async function getMemberStanding(locale: string, memberId: string): Promise<MemberStanding> {
  const { supabase } = await sessionClient(locale);
  const [balanceRes, boardRes] = await Promise.all([
    supabase.from("points_balances").select("total_points, levels(name)").eq("member_id", memberId).maybeSingle(),
    supabase.rpc("all_time_leaderboard"),
  ]);
  if (balanceRes.error) throw new Error(`points_balances: ${balanceRes.error.message}`);
  if (boardRes.error) throw new Error(`all_time_leaderboard: ${boardRes.error.message}`);
  const level = balanceRes.data?.levels as { name: string } | { name: string }[] | null | undefined;
  const row = ((boardRes.data ?? []) as { member_id: string; rank: number }[]).find((r) => r.member_id === memberId);
  return {
    totalPoints: balanceRes.data?.total_points ?? 0,
    rank: row ? Number(row.rank) : null,
    levelName: (Array.isArray(level) ? level[0]?.name : level?.name) ?? null,
  };
}

// ── Moment 5, تغيّر الترتيب — what the member last saw on each board (wave 16, add-only) ──
//
// `REQ-UIX-048`, `DEC-195` §2.6, `DEC-197` §6. The all-time board keeps no history
// and the snapshot boards are replaced in place every night, so «since last
// view» is `member_seen_marks` (0162): the rank last shown per board and period,
// and the own company's rank and bar. Read here; written by `markBoardSeen()`,
// which the client that showed the board calls — never a render.
//
// ★ Only a RISE is an occurrence. A fall, a tie, a new month, a new company or
// no mark at all is the static state, and the mark moves on quietly.

/** `weekly` is wave 20's, add-only (DEC-216 §2.2): the live week, its period the week's Saturday. */
export type BoardKind = "all_time" | "monthly" | "company" | "weekly";

export interface BoardMark {
  board: BoardKind;
  /** `YYYY-MM-DD` — the snapshot's month; null for the all-time board. */
  period: string | null;
  rank: number | null;
  companyId: string | null;
  fraction: number | null;
}

export interface BoardMoment {
  /** `useMoment("rank", …)`'s id, or null: nothing plays. */
  occurrenceId: string | null;
  /** The rank last seen, when this board's mark is comparable — the rise arrow reads it. */
  seenRank: number | null;
  /** The own company's bar last seen (company board). */
  seenFraction: number | null;
  needsMark: boolean;
  mark: BoardMark;
}

type SeenBoards = {
  all_time_rank: number | null;
  monthly_period: string | null;
  monthly_rank: number | null;
  company_period: string | null;
  company_id: string | null;
  company_rank: number | null;
  company_fraction: number | string | null;
  /** wave 20 (0169), add-only: the week's pair — absent from a caller that does not read it. */
  weekly_period?: string | null;
  weekly_rank?: number | null;
};

/** The rule, pure — exported for its unit test. */
export function decideBoardMoment(board: BoardKind, seen: SeenBoards | null, now: BoardMark): BoardMoment {
  const seenFractionRaw = seen?.company_fraction;
  const seenFractionNum = seenFractionRaw === null || seenFractionRaw === undefined ? null : Number(seenFractionRaw);
  const stored: BoardMark | null = seen
    ? board === "all_time"
      ? { board, period: null, rank: seen.all_time_rank, companyId: null, fraction: null }
      : board === "monthly"
        ? { board, period: seen.monthly_period, rank: seen.monthly_rank, companyId: null, fraction: null }
        : board === "weekly"
          ? { board, period: seen.weekly_period ?? null, rank: seen.weekly_rank ?? null, companyId: null, fraction: null }
          : { board, period: seen.company_period, rank: seen.company_rank, companyId: seen.company_id, fraction: seenFractionNum }
    : null;
  const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);
  const needsMark =
    !stored ||
    stored.period !== now.period ||
    stored.rank !== now.rank ||
    stored.companyId !== now.companyId ||
    !same(stored.fraction, now.fraction);

  // Comparable only for the same period and, on the company board, the same company.
  const comparable = Boolean(stored && stored.rank !== null && stored.period === now.period && (board !== "company" || stored.companyId === now.companyId));
  if (!stored || !comparable || now.rank === null) return { occurrenceId: null, seenRank: null, seenFraction: null, needsMark, mark: now };

  const seenRank = stored.rank as number;
  const rose = now.rank < seenRank;
  const grew = board === "company" && stored.fraction !== null && now.fraction !== null && now.fraction > stored.fraction + 1e-9;
  if (!rose && !grew) return { occurrenceId: null, seenRank: null, seenFraction: null, needsMark, mark: now };

  const tail = board === "company" ? `${now.companyId}:${seenRank}-${now.rank}:${stored.fraction}-${now.fraction}` : `${seenRank}-${now.rank}`;
  return {
    occurrenceId: `${board}:${now.period ?? "all"}:${tail}`,
    seenRank: rose ? seenRank : null,
    seenFraction: grew ? stored.fraction : null,
    needsMark,
    mark: now,
  };
}

/** The viewer's moment on one board, from what `getLeaderboards()` already read plus their own mark. */
export async function getBoardMoment(locale: string, board: BoardKind, boards: Leaderboards): Promise<BoardMoment> {
  const { session, supabase } = await sessionClient(locale);
  const { data: seen, error } = await supabase
    .from("member_seen_marks")
    .select("all_time_rank, monthly_period, monthly_rank, company_period, company_id, company_rank, company_fraction")
    .eq("member_id", session.memberId)
    .maybeSingle();
  if (error) throw new Error(`member_seen_marks: ${error.message}`);

  let now: BoardMark;
  if (board === "all_time") {
    now = { board, period: null, rank: boards.allTime.find((r) => r.isSelf)?.rank ?? null, companyId: null, fraction: null };
  } else if (board === "monthly") {
    now = { board, period: boards.monthly?.periodStart ?? null, rank: boards.monthly?.rows.find((r) => r.isSelf)?.rank ?? null, companyId: null, fraction: null };
  } else {
    const rows = boards.company?.rows ?? [];
    const own = rows.find((r) => r.isOwn) ?? null;
    const fraction = own ? (companyFractions(rows, boards.companyMetric).get(own.companyId) ?? null) : null;
    now = { board, period: boards.company?.periodStart ?? null, rank: own?.rank ?? null, companyId: own?.companyId ?? null, fraction };
  }
  return decideBoardMoment(board, (seen as SeenBoards | null) ?? null, now);
}

const BoardMarkInput = z.object({
  board: z.enum(["all_time", "monthly", "company", "weekly"]),
  period: z.iso.date().nullable(),
  rank: z.number().int().positive().nullable(),
  companyId: z.uuid().nullable(),
  fraction: z.number().min(0).max(1).nullable(),
});

/** Called by the client that showed the board, with what it showed (`DEC-195` §2.6). The caller's own row only. */
export async function markBoardSeen(locale: string, input: BoardMark): Promise<void> {
  const m = BoardMarkInput.parse(input);
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("mark_board_seen", { p_board: m.board, p_period: m.period, p_rank: m.rank, p_company: m.companyId, p_fraction: m.fraction });
  if (error) throw new Error(`mark_board_seen: ${error.message}`);
}

// ── The member's month and the company race, for the home (wave 18, add-only) ──
//
// `REQ-UIX-055`, `DEC-206` §4.47 – §4.50, `DEC-207` §1 — contract 4. The week on the
// home says the MONTHLY board's rank — there is no weekly board — and the race is
// the month's company snapshot. Both read the newest snapshot by `taken_at`, the
// same rule `getLeaderboards()` uses for `SCR-027` / `SCR-028`, so the home and the
// boards can never name different months. That snapshot is nightly: on the day
// after a month closes the newest is LAST month's final one (the job writes the
// new provisional first, then finalises the old), so the period is the snapshot's
// own, never today's. ★ These reads are narrow on purpose — a handful of rows, not
// `getLeaderboards()`'s eight round trips for the whole of three boards.
//
// Nothing here writes. An opted-out member reads their own rank (`REQ-LDR-008`,
// `DEC-207` §1.1) and is nobody's neighbour — `boards_read` hides their row from
// everyone else, so the neighbour query simply never meets it.

export interface WeekPeriod {
  /** `YYYY-MM-DD` — the snapshot's own month, not today's. */
  start: string;
  end: string;
  isFinal: boolean;
  takenAt: string;
  /** Whole days left after today until `end`; 0 on the last day; null once final. */
  daysLeft: number | null;
}

/** The snapshot's period, and the days left in it — pure, exported for its unit test.
 *  `end` is the day after the month, as the job writes it: the period closes at its midnight, UTC (0042). */
export function weekPeriod(s: { period_start: string; period_end: string; is_final: boolean; taken_at: string }, now: Date = new Date()): WeekPeriod {
  const [y, m, d] = s.period_end.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) - now.getTime();
  const daysLeft = s.is_final ? null : Math.max(0, Math.ceil(ms / 86_400_000) - 1);
  return { start: s.period_start, end: s.period_end, isFinal: s.is_final, takenAt: s.taken_at, daysLeft };
}

export interface WeekNeighbour {
  memberId: string;
  displayName: string;
  company: string | null;
  /** `companies.team_color`; reaches the DOM only as `--team`. */
  teamColor: string | null;
  rank: number;
  /** Their monthly points minus the viewer's, from the SAME snapshot. Always above zero. */
  gap: number;
}

export interface MonthlyStanding {
  /** null: the org has no monthly snapshot yet. */
  period: WeekPeriod | null;
  /** null is an absence — no snapshot, or no points this month. Never a zero. */
  rank: { rank: number; monthPoints: number; total: number; above: WeekNeighbour | null } | null;
  rankAbsence: "no_snapshot" | "no_points" | null;
  /** `members.leaderboard_opt_out` — the rank is still the member's own to see (REQ-LDR-008). */
  optedOut: boolean;
  /** Moment 5 on the week — `decideBoardMoment("monthly", …)`, the monthly tab's own rule and id. */
  moment: BoardMoment;
}

type EntryRow = { member_id: string; rank: number; points: number };

/** The caller's monthly standing. Read by `getMemberWeek()` (points.ts), which the home's two surfaces share. */
export async function getMonthlyStanding(locale: string): Promise<MonthlyStanding> {
  const { session, supabase } = await sessionClient(locale);
  const [snapRes, selfRes, seenRes] = await Promise.all([
    supabase
      .from("leaderboard_snapshots")
      .select("id, period_start, period_end, is_final, taken_at")
      .eq("org_id", session.orgId)
      .eq("kind", "monthly")
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("members").select("leaderboard_opt_out").eq("id", session.memberId).maybeSingle(),
    supabase.from("member_seen_marks").select("monthly_period, monthly_rank").eq("member_id", session.memberId).maybeSingle(),
  ]);
  if (snapRes.error) throw new Error(`leaderboard_snapshots (month): ${snapRes.error.message}`);
  if (selfRes.error) throw new Error(`members (month): ${selfRes.error.message}`);
  if (seenRes.error) throw new Error(`member_seen_marks (month): ${seenRes.error.message}`);

  const optedOut = Boolean(selfRes.data?.leaderboard_opt_out);
  const seenRow = seenRes.data as { monthly_period: string | null; monthly_rank: number | null } | null;
  const seen: SeenBoards | null = seenRow
    ? { all_time_rank: null, monthly_period: seenRow.monthly_period, monthly_rank: seenRow.monthly_rank, company_period: null, company_id: null, company_rank: null, company_fraction: null }
    : null;
  const snap = snapRes.data as { id: string; period_start: string; period_end: string; is_final: boolean; taken_at: string } | null;

  if (!snap) {
    return { period: null, rank: null, rankAbsence: "no_snapshot", optedOut, moment: decideBoardMoment("monthly", seen, { board: "monthly", period: null, rank: null, companyId: null, fraction: null }) };
  }
  const period = weekPeriod(snap);

  const [ownRes, countRes] = await Promise.all([
    supabase.from("leaderboard_entries").select("member_id, rank, points").eq("snapshot_id", snap.id).eq("member_id", session.memberId).maybeSingle(),
    supabase.rpc("monthly_ranked_count", { p_snapshot: snap.id }),
  ]);
  if (ownRes.error) throw new Error(`leaderboard_entries (month, own): ${ownRes.error.message}`);
  if (countRes.error) throw new Error(`monthly_ranked_count: ${countRes.error.message}`);
  const own = ownRes.data as EntryRow | null;
  const moment = decideBoardMoment("monthly", seen, { board: "monthly", period: snap.period_start, rank: own?.rank ?? null, companyId: null, fraction: null });
  if (!own) return { period, rank: null, rankAbsence: "no_points", optedOut, moment };

  // The visible row with the greatest rank BELOW the caller's number: strictly more points, so the gap is never 0.
  const { data: aboveRow, error: aboveError } = await supabase
    .from("leaderboard_entries")
    .select("member_id, rank, points")
    .eq("snapshot_id", snap.id)
    .not("member_id", "is", null)
    .lt("rank", own.rank)
    .order("rank", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (aboveError) throw new Error(`leaderboard_entries (month, above): ${aboveError.message}`);

  let above: WeekNeighbour | null = null;
  const a = aboveRow as EntryRow | null;
  if (a) {
    const { data: m, error } = await supabase.from("members").select("display_name, company_id").eq("id", a.member_id).maybeSingle();
    if (error) throw new Error(`members (month, above): ${error.message}`);
    let company: { name: string; team_color: string | null } | null = null;
    if (m?.company_id) {
      const { data: c, error: cError } = await supabase.from("companies").select("name, team_color").eq("id", m.company_id).maybeSingle();
      if (cError) throw new Error(`companies (month, above): ${cError.message}`);
      company = (c as { name: string; team_color: string | null } | null) ?? null;
    }
    above = {
      memberId: a.member_id,
      displayName: (m?.display_name as string | null | undefined) ?? "",
      company: company?.name ?? null,
      teamColor: company?.team_color ?? null,
      rank: a.rank,
      gap: a.points - own.points,
    };
  }

  // The count can only be missing if the function refused the snapshot, which it read a moment ago; the rank is the floor.
  const total = Math.max(own.rank, Number(countRes.data ?? 0));
  return { period, rank: { rank: own.rank, monthPoints: own.points, total, above }, rankAbsence: null, optedOut, moment };
}

export interface CompanyRaceRow {
  companyId: string;
  companyName: string;
  teamColor: string | null;
  rank: number;
  totalPoints: number;
  pointsPerActiveMember: number | null;
  /** 0 – 1 against the leader over ALL companies — `companyFractions()`, `SCR-028`'s own function. */
  fraction: number;
  isOwn: boolean;
  /** wave 20, PR C (add-only, REQ-UIX-082): below the snapshot's frozen minimum — the home draws «بلا ترتيب». */
  unranked?: boolean;
}

export interface CompanyRace {
  metric: "total_points" | "points_per_active_member";
  period: WeekPeriod;
  /** The leaders in rank order, then the viewer's own company if it is not among them. No duplicate. */
  rows: CompanyRaceRow[];
  /** null: the member has no company. */
  ownCompanyId: string | null;
  /** How many companies the snapshot ranks. */
  companies: number;
}

/** The race's rows: the first `leaders`, then the own company if it stands below them — pure, exported for its unit test. */
export function raceRows(all: CompanyRaceRow[], leaders: number): CompanyRaceRow[] {
  const head = all.slice(0, Math.max(0, leaders));
  const own = all.find((r) => r.isOwn);
  return own && !head.includes(own) ? [...head, own] : head;
}

/** The month's company race, for the home. null: no company snapshot yet, or one that ranks nobody.
 *  ★ It neither reads nor writes the company mark: the home's race has no moment, so `SCR-028` keeps its first sight. */
export async function getCompanyRace(locale: string, opts: { leaders?: number } = {}): Promise<CompanyRace | null> {
  const { session, supabase } = await sessionClient(locale);
  const [snapRes, settingsRes, viewerRes] = await Promise.all([
    // ★ wave 20, PR B (the lead's exception): the month's company snapshot, never the quarter's (`latestMonthly()`).
    supabase
      .from("leaderboard_snapshots")
      .select("id, period_start, period_end, is_final, taken_at, min_active_members")
      .eq("org_id", session.orgId)
      .eq("kind", "company")
      .order("taken_at", { ascending: false })
      .limit(SNAPSHOT_SCAN),
    supabase.from("org_settings").select("company_metric").eq("org_id", session.orgId).maybeSingle(),
    supabase.from("members").select("company_id").eq("id", session.memberId).maybeSingle(),
  ]);
  if (snapRes.error) throw new Error(`leaderboard_snapshots (race): ${snapRes.error.message}`);
  if (viewerRes.error) throw new Error(`members (race): ${viewerRes.error.message}`);
  const snap = latestMonthly((snapRes.data ?? []) as Array<{ id: string; period_start: string | null; period_end: string | null; is_final: boolean; taken_at: string; min_active_members: number | null }>);
  if (!snap || !snap.period_start || !snap.period_end) return null;
  const metric = (settingsRes.data?.company_metric as CompanyRace["metric"] | undefined) ?? "points_per_active_member";
  const ownCompanyId = (viewerRes.data?.company_id as string | null | undefined) ?? null;

  const { data: entries, error } = await supabase
    .from("leaderboard_entries")
    .select("company_id, rank, points, points_per_active_member")
    .eq("snapshot_id", snap.id)
    .not("company_id", "is", null)
    .order("rank");
  if (error) throw new Error(`leaderboard_entries (race): ${error.message}`);
  type Entry = { company_id: string; rank: number; points: number; points_per_active_member: number | string | null };
  const list = (entries ?? []) as Entry[];
  if (list.length === 0) return null;

  const { data: companies, error: cError } = await supabase.from("companies").select("id, name, team_color").in("id", list.map((e) => e.company_id));
  if (cError) throw new Error(`companies (race): ${cError.message}`);
  const byId = new Map(((companies ?? []) as Array<{ id: string; name: string; team_color: string | null }>).map((c) => [c.id, c]));

  const board: CompanyBoardRow[] = list.map((e) => ({
    companyId: e.company_id,
    companyName: byId.get(e.company_id)?.name ?? "",
    rank: e.rank,
    totalPoints: e.points,
    pointsPerActiveMember: e.points_per_active_member === null ? null : Number(e.points_per_active_member),
    teamColor: byId.get(e.company_id)?.team_color ?? null,
    isOwn: ownCompanyId !== null && e.company_id === ownCompanyId,
    unranked: isUnranked(snap.min_active_members, e.points, e.points_per_active_member),
  }));
  const fractions = companyFractions(board, metric);
  const all: CompanyRaceRow[] = board.map((r) => ({
    companyId: r.companyId,
    companyName: r.companyName,
    teamColor: r.teamColor ?? null,
    rank: r.rank,
    totalPoints: r.totalPoints,
    pointsPerActiveMember: r.pointsPerActiveMember,
    fraction: fractions.get(r.companyId) ?? 0,
    isOwn: Boolean(r.isOwn),
    unranked: Boolean(r.unranked),
  }));

  return {
    metric,
    period: weekPeriod({ period_start: snap.period_start, period_end: snap.period_end, is_final: snap.is_final, taken_at: snap.taken_at }),
    rows: raceRows(all, opts.leaders ?? 2),
    ownCompanyId,
    companies: all.length,
  };
}

// ── Whether attending raises a company's share in the race (wave 18 PR B, add-only — DEC-210) ──
//
// The desktop event page may say «لفريقك» — that a member's attendance raises their company's participation in
// the race — only when that is the org's rule: `company_attendance_pct` enabled (0081). A sentence about a
// rule the org has switched off is false (contract 7). `company_scoring_rules` is org-readable, as
// `getCompanyPointsBreakdown()` already reads it.
export async function isCompanyAttendanceRuleEnabled(locale: string): Promise<boolean> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("company_scoring_rules")
    .select("enabled")
    .eq("org_id", session.orgId)
    .eq("action_key", "company_attendance_pct")
    .maybeSingle();
  if (error) throw new Error(`company_scoring_rules (attendance): ${error.message}`);
  return Boolean(data?.enabled);
}

// ── Another member's rank this month, for their profile (SCR-020, wave 19, add-only) ────────────────────────
//
// `DEC-213` §5.114: the profile's ranks are the MONTH's and the all-time — there is no weekly board. The month's is
// the member's row in the latest monthly snapshot (by `taken_at`, as `getMonthlyStanding()` reads it), through
// `boards_read`: an opted-out member's row is invisible to everyone but themselves, admins included (`0027:487-491`,
// `REQ-LDR-008`, `DEC-214` §1). Null is an absence — no snapshot, no points this month, or withheld — never a zero.

export async function getMemberMonthRank(locale: string, memberId: string): Promise<number | null> {
  if (!z.uuid().safeParse(memberId).success) return null;
  const { session, supabase } = await sessionClient(locale);
  const { data: snap, error } = await supabase
    .from("leaderboard_snapshots")
    .select("id")
    .eq("org_id", session.orgId)
    .eq("kind", "monthly")
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`leaderboard_snapshots (profile): ${error.message}`);
  const snapshotId = (snap as { id?: string } | null)?.id;
  if (!snapshotId) return null;
  const { data: row, error: rowError } = await supabase.from("leaderboard_entries").select("rank").eq("snapshot_id", snapshotId).eq("member_id", memberId).maybeSingle();
  if (rowError) throw new Error(`leaderboard_entries (profile): ${rowError.message}`);
  const rank = (row as { rank?: number } | null)?.rank;
  return typeof rank === "number" ? rank : null;
}

// ── This week, live — contract 4 (wave 20, add-only) ─────────────────────────────────────────────────────────────
//
// `REQ-UIX-078`, `DEC-216` §2.2, `DEC-217` §3.3 – §3.4, `DEC-218`. The week is summed from `points_ledger` at read
// time by `weekly_leaderboard()` — no enum value, no snapshot, no job — over `org_week()`: Saturday to Friday in the
// org's own time zone. Opt-out and the active rule are the DATABASE's (the function follows 0044); this reads what
// the caller may see. ★ An absence is an absence: no points this week is `rank: null`, never a zero rank.
//
// ★ Moment 5 on the week reads the weekly seen pair (0169) through `decideBoardMoment("weekly", …)`. Nothing writes
// that pair until `mark_board_seen()` learns the week (PR B, `DEC-217` §3.3) — so until then the moment never plays
// and the surface asks to acknowledge nothing: `WEEKLY_MARK_WRITABLE` is the one switch, turned on in PR B.

/** Whether `mark_board_seen()` accepts `weekly` in this deployment — PR B: yes (`DEC-217` §3.3). */
export const WEEKLY_MARK_WRITABLE = true;

export interface WeekWindow {
  /** `YYYY-MM-DD` — the Saturday the week starts on. */
  start: string;
  /** `YYYY-MM-DD` — the Friday it ends on, inclusive. */
  end: string;
  /** Whole days left after today until `end`; 0 on the Friday itself. */
  daysLeft: number;
  /** `org_settings.time_zone`. */
  timeZone: string;
}

export interface WeekStanding {
  window: WeekWindow;
  /** null is an ABSENCE — `absence` says why. Never a zero rank. */
  rank: { rank: number; points: number; ranked: number; above: WeekNeighbour | null } | null;
  absence: "no_points" | null;
  /** `members.leaderboard_opt_out`: the rank is still theirs to see, and hidden from everyone else (REQ-LDR-008). */
  optedOut: boolean;
  /** Moment 5 on the week — `decideBoardMoment("weekly", …)`, keyed `weekly:<start>:<seen>-<now>`. */
  moment: BoardMoment;
}

type WeekRow = { member_id: string; rank: number | string; points: number };
type OrgWeekRow = { week_start: string; week_end: string; time_zone: string };

/** The days left in the week, counted in the org's own calendar — pure, exported for its unit test. */
export function weekDaysLeft(end: string, timeZone: string, now: Date = new Date()): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** The caller's place in the week, from the board's rows — pure, exported for its unit test. The neighbour above is
 *  the visible row with the greatest rank below the caller's and STRICTLY more points, so a gap is never 0. */
export function weekPlace(rows: Array<{ memberId: string; rank: number; points: number }>, self: string): { rank: number; points: number; ranked: number; aboveId: string | null; gap: number } | null {
  const own = rows.find((r) => r.memberId === self);
  if (!own) return null;
  const above = rows.filter((r) => r.rank < own.rank && r.points > own.points).sort((a, b) => b.rank - a.rank)[0] ?? null;
  return { rank: own.rank, points: own.points, ranked: rows.length, aboveId: above?.memberId ?? null, gap: above ? above.points - own.points : 0 };
}

/** Contract 4. Request-scoped: the card on `021`, the band and `027` ask once between them. */
export const getWeekStanding = cache(async (locale: string): Promise<WeekStanding> => {
  const { session, supabase } = await sessionClient(locale);
  const [weekRes, boardRes, selfRes, seenRes] = await Promise.all([
    supabase.rpc("org_week"),
    supabase.rpc("weekly_leaderboard"),
    supabase.from("members").select("leaderboard_opt_out").eq("id", session.memberId).maybeSingle(),
    supabase.from("member_seen_marks").select("weekly_period, weekly_rank").eq("member_id", session.memberId).maybeSingle(),
  ]);
  if (weekRes.error) throw new Error(`org_week: ${weekRes.error.message}`);
  if (boardRes.error) throw new Error(`weekly_leaderboard: ${boardRes.error.message}`);
  if (selfRes.error) throw new Error(`members (weekly): ${selfRes.error.message}`);
  if (seenRes.error) throw new Error(`member_seen_marks (weekly): ${seenRes.error.message}`);

  const week = ((weekRes.data ?? []) as OrgWeekRow[])[0];
  if (!week) throw new Error("org_week: no row");
  const window: WeekWindow = { start: week.week_start, end: week.week_end, daysLeft: weekDaysLeft(week.week_end, week.time_zone), timeZone: week.time_zone };

  const rows = ((boardRes.data ?? []) as WeekRow[]).map((r) => ({ memberId: r.member_id, rank: Number(r.rank), points: r.points }));
  const place = weekPlace(rows, session.memberId);
  const seenRow = seenRes.data as { weekly_period: string | null; weekly_rank: number | null } | null;
  const seen: SeenBoards | null = seenRow
    ? { all_time_rank: null, monthly_period: null, monthly_rank: null, company_period: null, company_id: null, company_rank: null, company_fraction: null, weekly_period: seenRow.weekly_period, weekly_rank: seenRow.weekly_rank }
    : null;
  const decided = decideBoardMoment("weekly", seen, { board: "weekly", period: window.start, rank: place?.rank ?? null, companyId: null, fraction: null });
  const moment: BoardMoment = WEEKLY_MARK_WRITABLE ? decided : { ...decided, occurrenceId: null, seenRank: null, needsMark: false };
  const optedOut = Boolean(selfRes.data?.leaderboard_opt_out);

  if (!place) return { window, rank: null, absence: "no_points", optedOut, moment };

  let above: WeekNeighbour | null = null;
  if (place.aboveId) {
    const { data: m, error } = await supabase.from("members").select("display_name, company_id").eq("id", place.aboveId).maybeSingle();
    if (error) throw new Error(`members (weekly, above): ${error.message}`);
    let company: { name: string; team_color: string | null } | null = null;
    if (m?.company_id) {
      const { data: c, error: cError } = await supabase.from("companies").select("name, team_color").eq("id", m.company_id).maybeSingle();
      if (cError) throw new Error(`companies (weekly, above): ${cError.message}`);
      company = (c as { name: string; team_color: string | null } | null) ?? null;
    }
    const aboveRank = rows.find((r) => r.memberId === place.aboveId)!.rank;
    above = {
      memberId: place.aboveId,
      displayName: (m?.display_name as string | null | undefined) ?? "",
      company: company?.name ?? null,
      teamColor: company?.team_color ?? null,
      rank: aboveRank,
      gap: place.gap,
    };
  }
  return { window, rank: { rank: place.rank, points: place.points, ranked: place.ranked, above }, absence: null, optedOut, moment };
});

// ── The boards, rebuilt (wave 20, PR B, add-only) ───────────────────────────────────────────────────────────────
//
// `REQ-UIX-078`, `REQ-UIX-079`, `DEC-216` §2.2, `DEC-219` §2 (as corrected: the cup is a `company` snapshot whose
// period is a quarter). Nothing here writes.

/** This week's board, live — `weekly_leaderboard()` (0171) with names and companies. Opt-out is the function's. */
export interface WeeklyBoard {
  window: WeekWindow;
  rows: MemberBoardRow[];
  /** How many the week ranks for this viewer. */
  ranked: number;
}

export async function getWeeklyBoard(locale: string): Promise<WeeklyBoard> {
  const { session, supabase } = await sessionClient(locale);
  const [standing, boardRes] = await Promise.all([getWeekStanding(locale), supabase.rpc("weekly_leaderboard")]);
  if (boardRes.error) throw new Error(`weekly_leaderboard: ${boardRes.error.message}`);
  const raw = (boardRes.data ?? []) as WeekRow[];
  const ids = raw.map((r) => r.member_id);
  const { data: members, error } = ids.length
    ? await supabase.from("members").select("id, display_name, company_id").in("id", ids)
    : { data: [] as Array<{ id: string; display_name: string | null; company_id: string | null }>, error: null };
  if (error) throw new Error(`members (weekly board): ${error.message}`);
  const byId = new Map(((members ?? []) as Array<{ id: string; display_name: string | null; company_id: string | null }>).map((m) => [m.id, m]));
  const companyIds = [...new Set([...byId.values()].map((m) => m.company_id).filter((id): id is string => Boolean(id)))];
  const { data: companies, error: cError } = companyIds.length
    ? await supabase.from("companies").select("id, name, team_color").in("id", companyIds)
    : { data: [] as Array<{ id: string; name: string; team_color: string | null }>, error: null };
  if (cError) throw new Error(`companies (weekly board): ${cError.message}`);
  const companyOf = new Map(((companies ?? []) as Array<{ id: string; name: string; team_color: string | null }>).map((c) => [c.id, c]));
  const rows: MemberBoardRow[] = raw.map((r) => {
    const m = byId.get(r.member_id);
    const c = m?.company_id ? companyOf.get(m.company_id) : undefined;
    return {
      memberId: r.member_id,
      displayName: m?.display_name ?? "",
      rank: Number(r.rank),
      points: r.points,
      isSelf: r.member_id === session.memberId,
      company: c?.name ?? null,
      teamColor: c?.team_color ?? null,
    };
  });
  return { window: standing.window, rows, ranked: rows.length };
}

/** The viewer's place on a board's rows, and the visible row above with STRICTLY more points — pure, exported. */
export function boardPlace(rows: MemberBoardRow[]): { rank: number; points: number; above: { displayName: string; gap: number } | null } | null {
  const own = rows.find((r) => r.isSelf);
  if (!own) return null;
  const above = rows.filter((r) => r.rank < own.rank && r.points > own.points).sort((a, b) => b.rank - a.rank)[0] ?? null;
  return { rank: own.rank, points: own.points, above: above ? { displayName: above.displayName, gap: above.points - own.points } : null };
}

/** «N نشطًا»: a company's frozen active count, implied by the frozen pair — `round(points ÷ per-member)`. The snapshot
 *  stores the ratio unrounded (16 fractional digits), so the round trip is exact (scoring's note, §H). null when
 *  either is missing or 0 — never a guess. Pure, exported for its test. */
export function derivedActive(points: number, perMember: number | string | null): number | null {
  const ratio = perMember === null ? null : Number(perMember);
  if (!ratio || !Number.isFinite(ratio) || !points) return null;
  const n = Math.round(points / ratio);
  return n > 0 ? n : null;
}

/** «بلا ترتيب»: a company below its snapshot's FROZEN minimum of active members (0175, 0176). A snapshot taken before
 *  the minimum existed (null) ranks everyone. The count is recovered exactly from the frozen pair; none (no active
 *  member) is 0, which is below any minimum. Pure, exported for its test. */
export function isUnranked(minimum: number | null | undefined, points: number, perMember: number | string | null): boolean {
  if (minimum == null) return false;
  return (derivedActive(points, perMember) ?? 0) < minimum;
}

/** The quarter of a period: its number (1 – 4) and year; and, mid-quarter, which month of three today is. Pure. */
export function quarterOf(start: string, today: string): { quarter: number; year: number; round: number } {
  const [y, m] = start.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  const round = Math.min(3, Math.max(1, (ty - y) * 12 + (tm - m) + 1));
  return { quarter: Math.floor((m - 1) / 3) + 1, year: y, round };
}

export interface CompanyCup {
  quarter: number;
  year: number;
  /** The month within the quarter, 1 – 3 — «الجولة N من 3». */
  round: number;
  /** Days left to the quarter's end, in the org's zone; null once final. */
  daysLeft: number | null;
  isFinal: boolean;
  takenAt: string;
  periodStart: string;
  metric: "total_points" | "points_per_active_member";
  rows: Array<CompanyBoardRow & { active: number | null }>;
  timeZone: string;
}

/** The quarter's cup — the newest `company` snapshot whose period is a calendar quarter. null: none yet (before the
 *  nightly task has taken one — `main`'s worker never does). */
export async function getCompanyCup(locale: string): Promise<CompanyCup | null> {
  const { session, supabase } = await sessionClient(locale);
  const [snapRes, settingsRes, viewerRes] = await Promise.all([
    supabase
      .from("leaderboard_snapshots")
      .select("id, period_start, period_end, is_final, taken_at, metric, min_active_members")
      .eq("org_id", session.orgId)
      .eq("kind", "company")
      .order("taken_at", { ascending: false })
      .limit(SNAPSHOT_SCAN),
    supabase.from("org_settings").select("company_metric, time_zone").eq("org_id", session.orgId).maybeSingle(),
    supabase.from("members").select("company_id").eq("id", session.memberId).maybeSingle(),
  ]);
  if (snapRes.error) throw new Error(`leaderboard_snapshots (cup): ${snapRes.error.message}`);
  if (viewerRes.error) throw new Error(`members (cup): ${viewerRes.error.message}`);
  type Snap = { id: string; period_start: string | null; period_end: string | null; is_final: boolean; taken_at: string; metric: CompanyCup["metric"] | null; min_active_members: number | null };
  const snap = ((snapRes.data ?? []) as Snap[]).find((r) => isQuarterPeriod(r.period_start, r.period_end)) ?? null;
  if (!snap || !snap.period_start || !snap.period_end) return null;
  const timeZone = (settingsRes.data?.time_zone as string | undefined) ?? "Asia/Riyadh";
  // The metric the snapshot FROZE (0042:58), not today's setting (REQ-LDR-005: closed periods keep theirs).
  const metric = snap.metric ?? ((settingsRes.data?.company_metric as CompanyCup["metric"] | undefined) ?? "points_per_active_member");
  const viewerCompany = (viewerRes.data?.company_id as string | null | undefined) ?? null;

  const { data: entries, error } = await supabase
    .from("leaderboard_entries")
    .select("company_id, rank, points, points_per_active_member")
    .eq("snapshot_id", snap.id)
    .not("company_id", "is", null)
    .order("rank");
  if (error) throw new Error(`leaderboard_entries (cup): ${error.message}`);
  type Entry = { company_id: string; rank: number; points: number; points_per_active_member: number | string | null };
  const list = (entries ?? []) as Entry[];
  const { data: companies, error: cError } = list.length
    ? await supabase.from("companies").select("id, name, team_color").in("id", list.map((e) => e.company_id))
    : { data: [] as Array<{ id: string; name: string; team_color: string | null }>, error: null };
  if (cError) throw new Error(`companies (cup): ${cError.message}`);
  const byId = new Map(((companies ?? []) as Array<{ id: string; name: string; team_color: string | null }>).map((c) => [c.id, c]));

  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { quarter, year, round } = quarterOf(snap.period_start, today);
  // `period_end` is the day after the quarter; its last day is the one before.
  const lastDay = new Date(Date.parse(`${snap.period_end}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return {
    quarter,
    year,
    round,
    daysLeft: snap.is_final ? null : weekDaysLeft(lastDay, timeZone),
    isFinal: snap.is_final,
    takenAt: snap.taken_at,
    periodStart: snap.period_start,
    metric,
    timeZone,
    rows: list.map((e) => ({
      companyId: e.company_id,
      companyName: byId.get(e.company_id)?.name ?? "",
      rank: e.rank,
      totalPoints: e.points,
      pointsPerActiveMember: e.points_per_active_member === null ? null : Number(e.points_per_active_member),
      teamColor: byId.get(e.company_id)?.team_color ?? null,
      isOwn: viewerCompany !== null && e.company_id === viewerCompany,
      active: derivedActive(e.points, e.points_per_active_member),
      unranked: isUnranked(snap.min_active_members, e.points, e.points_per_active_member),
    })),
  };
}

/** A per-category board (REQ-LDR-003) — the newest `topic` snapshot for the category, all time (the nightly task's,
 *  `snapshot_leaderboards.ts`). Opt-out is `boards_read`'s. null: no snapshot for it yet, or a category of no org. */
export interface TopicBoard {
  categoryId: string;
  categoryName: string;
  rows: MemberBoardRow[];
  takenAt: string;
}

export async function listBoardCategories(locale: string): Promise<Array<{ id: string; name: string }>> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("categories").select("id, name").eq("org_id", session.orgId).order("name");
  if (error) throw new Error(`categories (boards): ${error.message}`);
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function getTopicBoard(locale: string, categoryId: string): Promise<TopicBoard | null> {
  if (!z.uuid().safeParse(categoryId).success) return null;
  const { session, supabase } = await sessionClient(locale);
  const [catRes, snapRes] = await Promise.all([
    supabase.from("categories").select("id, name").eq("org_id", session.orgId).eq("id", categoryId).maybeSingle(),
    supabase
      .from("leaderboard_snapshots")
      .select("id, taken_at")
      .eq("org_id", session.orgId)
      .eq("kind", "topic")
      .eq("category_id", categoryId)
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (catRes.error) throw new Error(`categories (topic): ${catRes.error.message}`);
  if (snapRes.error) throw new Error(`leaderboard_snapshots (topic): ${snapRes.error.message}`);
  if (!catRes.data) return null;
  const snap = snapRes.data as { id: string; taken_at: string } | null;
  if (!snap) return { categoryId, categoryName: catRes.data.name as string, rows: [], takenAt: "" };
  const { data: entries, error } = await supabase.from("leaderboard_entries").select("member_id, rank, points").eq("snapshot_id", snap.id).not("member_id", "is", null).order("rank");
  if (error) throw new Error(`leaderboard_entries (topic): ${error.message}`);
  const list = (entries ?? []) as Array<{ member_id: string; rank: number; points: number }>;
  const { data: members, error: mError } = list.length
    ? await supabase.from("members").select("id, display_name, company_id").in("id", list.map((e) => e.member_id))
    : { data: [] as Array<{ id: string; display_name: string | null; company_id: string | null }>, error: null };
  if (mError) throw new Error(`members (topic): ${mError.message}`);
  const byId = new Map(((members ?? []) as Array<{ id: string; display_name: string | null; company_id: string | null }>).map((m) => [m.id, m]));
  const companyIds = [...new Set([...byId.values()].map((m) => m.company_id).filter((id): id is string => Boolean(id)))];
  const { data: companies } = companyIds.length
    ? await supabase.from("companies").select("id, name, team_color").in("id", companyIds)
    : { data: [] as Array<{ id: string; name: string; team_color: string | null }> };
  const companyOf = new Map(((companies ?? []) as Array<{ id: string; name: string; team_color: string | null }>).map((c) => [c.id, c]));
  return {
    categoryId,
    categoryName: catRes.data.name as string,
    takenAt: snap.taken_at,
    rows: list.map((e) => {
      const m = byId.get(e.member_id);
      const c = m?.company_id ? companyOf.get(m.company_id) : undefined;
      return { memberId: e.member_id, displayName: m?.display_name ?? "", rank: e.rank, points: e.points, isSelf: e.member_id === session.memberId, company: c?.name ?? null, teamColor: c?.team_color ?? null };
    }),
  };
}
