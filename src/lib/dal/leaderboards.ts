import "server-only";
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
    supabase
      .from("leaderboard_snapshots")
      .select("id, is_final, taken_at, period_start")
      .eq("org_id", session.orgId)
      .eq("kind", "company")
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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

  let company: Leaderboards["company"] = null;
  if (companySnapRes.data) {
    const { data: entries, error } = await supabase
      .from("leaderboard_entries")
      .select("company_id, rank, points, points_per_active_member")
      .eq("snapshot_id", companySnapRes.data.id)
      .order("rank");
    if (error) throw new Error(`leaderboard_entries (company): ${error.message}`);
    const ids = (entries ?? []).map((e) => e.company_id).filter((id): id is string => Boolean(id));
    const { data: companies } = ids.length
      ? await supabase.from("companies").select("id, name, team_color").in("id", ids)
      : { data: [] as Array<{ id: string; name: string; team_color: string | null }> };
    const companyNameOf = new Map((companies ?? []).map((c) => [c.id, c.name]));
    const companyColourOf = new Map((companies ?? []).map((c) => [c.id, (c.team_color as string | null) ?? null]));
    company = {
      isFinal: companySnapRes.data.is_final,
      takenAt: companySnapRes.data.taken_at,
      periodStart: (companySnapRes.data.period_start as string | null) ?? null,
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

export type BoardKind = "all_time" | "monthly" | "company";

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
  board: z.enum(["all_time", "monthly", "company"]),
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
