import "server-only";
import { sessionClient } from "@/lib/dal/session";
import type { NumeralSystem } from "@/components/sessions/numerals";

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
  numerals: NumeralSystem;
  timeZone: string;
}

export async function getLeaderboards(locale: string): Promise<Leaderboards> {
  const { session, supabase } = await sessionClient(locale);

  const [allTimeRes, settingsRes, monthlySnapRes, companySnapRes] = await Promise.all([
    supabase.rpc("all_time_leaderboard"),
    supabase.from("org_settings").select("numerals, company_metric, time_zone").eq("org_id", session.orgId).maybeSingle(),
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

  const numerals = (settingsRes.data?.numerals as NumeralSystem) ?? "western";
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

  return { allTime, monthly, company, companyMetric, numerals, timeZone: settingsRes.data?.time_zone ?? "Asia/Riyadh" };
}
