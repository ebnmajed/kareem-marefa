import "server-only";
import { sessionClient } from "@/lib/dal/session";

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
}

export interface CompanyBoardRow {
  companyId: string;
  companyName: string;
  rank: number;
  totalPoints: number;
  pointsPerActiveMember: number | null;
}

export interface Leaderboards {
  allTime: MemberBoardRow[];
  monthly: { rows: MemberBoardRow[]; periodStart: string; periodEnd: string; isFinal: boolean } | null;
  company: { rows: CompanyBoardRow[]; isFinal: boolean; takenAt: string } | null;
  companyMetric: "total_points" | "points_per_active_member";
  timeZone: string;
}

export async function getLeaderboards(locale: string): Promise<Leaderboards> {
  const { session, supabase } = await sessionClient(locale);

  const [allTimeRes, settingsRes, monthlySnapRes, companySnapRes] = await Promise.all([
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
      .select("id, is_final, taken_at")
      .eq("org_id", session.orgId)
      .eq("kind", "company")
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (allTimeRes.error) throw new Error(`all_time_leaderboard: ${allTimeRes.error.message}`);
  const companyMetric = (settingsRes.data?.company_metric as "total_points" | "points_per_active_member") ?? "points_per_active_member";

  type AllTimeRow = { member_id: string; rank: number; total_points: number };
  const allTimeRows = (allTimeRes.data ?? []) as AllTimeRow[];
  const memberIds = allTimeRows.map((r) => r.member_id);
  const { data: members } = memberIds.length
    ? await supabase.from("members").select("id, display_name").in("id", memberIds)
    : { data: [] as Array<{ id: string; display_name: string | null }> };
  const nameOf = new Map((members ?? []).map((m) => [m.id, m.display_name ?? ""]));

  const allTime: MemberBoardRow[] = allTimeRows.map((r) => ({
    memberId: r.member_id,
    displayName: nameOf.get(r.member_id) ?? "",
    rank: r.rank,
    points: r.total_points,
    isSelf: r.member_id === session.memberId,
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
      ? await supabase.from("members").select("id, display_name").in("id", ids)
      : { data: [] as Array<{ id: string; display_name: string | null }> };
    const monthlyNameOf = new Map((monthlyMembers ?? []).map((m) => [m.id, m.display_name ?? ""]));
    monthly = {
      periodStart: monthlySnapRes.data.period_start,
      periodEnd: monthlySnapRes.data.period_end,
      isFinal: monthlySnapRes.data.is_final,
      rows: (entries ?? [])
        .filter((e): e is { member_id: string; rank: number; points: number } => Boolean(e.member_id))
        .map((e) => ({ memberId: e.member_id, displayName: monthlyNameOf.get(e.member_id) ?? "", rank: e.rank, points: e.points, isSelf: e.member_id === session.memberId })),
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
      ? await supabase.from("companies").select("id, name").in("id", ids)
      : { data: [] as Array<{ id: string; name: string }> };
    const companyNameOf = new Map((companies ?? []).map((c) => [c.id, c.name]));
    company = {
      isFinal: companySnapRes.data.is_final,
      takenAt: companySnapRes.data.taken_at,
      rows: (entries ?? [])
        .filter((e): e is { company_id: string; rank: number; points: number; points_per_active_member: number | null } => Boolean(e.company_id))
        .map((e) => ({
          companyId: e.company_id,
          companyName: companyNameOf.get(e.company_id) ?? "",
          rank: e.rank,
          totalPoints: e.points,
          pointsPerActiveMember: e.points_per_active_member,
        })),
    };
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
