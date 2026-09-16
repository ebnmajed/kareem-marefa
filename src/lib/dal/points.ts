import "server-only";
import { sessionClient } from "@/lib/dal/session";

// The member's points history (SCR-022, REQ-PTS-003, `05` §8). The test of
// this screen is REQ-PTS-003's own wording: a member must be able to
// explain every point they hold without asking anyone. Every write here
// belongs to `award_points()`, the manual-adjustment RPC, and the reversal
// trigger (supabase/proposed/scoring/) — nothing in this module writes to
// points_ledger; it only ever reads the member's own rows, which
// POL-points_ledger.select already restricts to self-or-admin.

export interface PointsLedgerRow {
  id: string;
  occurredAt: string;
  amount: number;
  reason: string;
  ruleKey: string | null;
  source: string;
  sessionId: string | null;
  sessionTitle: string | null;
  isReversal: boolean;
  isManualAdjustment: boolean;
}

export interface CatalogueEntry {
  actionKey: string;
  points: number;
  enabled: boolean;
  reasonAr: string;
  capPerSession: number | null;
}

export interface SessionOption {
  id: string;
  title: string;
}

export interface PointsHistoryFilters {
  sessionId?: string;
  /** `YYYY-MM`, the org's own month — 05 §8 asks for filtering by month. */
  month?: string;
}

export interface PointsHistory {
  totalPoints: number;
  rows: PointsLedgerRow[];
  /** Every session the member has at least one ledger row for, for the
   *  filter control — independent of any filter currently applied. */
  sessionOptions: SessionOption[];
  /** `scoring_rules`, live — 05 §8: "what earns what… never a hard-coded
   *  list that drifts from the configuration." Only enabled, non-zero rules
   *  are worth explaining to a member; the zero-point negative actions
   *  (no_show, late_cancellation, comment_removed, photo_removed) explain
   *  themselves on the row that carries them instead. */
  catalogue: CatalogueEntry[];
  timeZone: string;
}

function monthRange(month: string): { gte: string; lt: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;
  const start = new Date(Date.UTC(year, m - 1, 1));
  const end = new Date(Date.UTC(year, m, 1));
  return { gte: start.toISOString(), lt: end.toISOString() };
}

export async function getPointsHistory(locale: string, filters: PointsHistoryFilters = {}): Promise<PointsHistory> {
  const { session, supabase } = await sessionClient(locale);

  let query = supabase
    .from("points_ledger")
    .select("id, occurred_at, amount, reason, rule_key, source, session_id, sessions(title)")
    .eq("member_id", session.memberId)
    .order("occurred_at", { ascending: false });

  if (filters.sessionId) query = query.eq("session_id", filters.sessionId);
  const range = filters.month ? monthRange(filters.month) : null;
  if (range) query = query.gte("occurred_at", range.gte).lt("occurred_at", range.lt);

  const [ledgerRes, balanceRes, allRes, settingsRes, rulesRes] = await Promise.all([
    query,
    supabase.from("points_balances").select("total_points").eq("member_id", session.memberId).maybeSingle(),
    // Unfiltered pass, session id and title only — the filter control's own
    // option list must not shrink just because a filter is applied.
    supabase.from("points_ledger").select("session_id, sessions(title)").eq("member_id", session.memberId).not("session_id", "is", null),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
    supabase
      .from("scoring_rules")
      .select("action_key, points, enabled, reason_ar, cap_per_session")
      .eq("org_id", session.orgId)
      .order("action_key"),
  ]);
  if (ledgerRes.error) throw new Error(`points_ledger: ${ledgerRes.error.message}`);
  if (allRes.error) throw new Error(`points_ledger (sessions): ${allRes.error.message}`);
  if (rulesRes.error) throw new Error(`scoring_rules: ${rulesRes.error.message}`);

  type LedgerJoinRow = {
    id: string;
    occurred_at: string;
    amount: number;
    reason: string;
    rule_key: string | null;
    source: string;
    session_id: string | null;
    sessions: { title: string } | { title: string }[] | null;
  };
  const titleOf = (s: LedgerJoinRow["sessions"]): string | null => (Array.isArray(s) ? (s[0]?.title ?? null) : (s?.title ?? null));

  const rows: PointsLedgerRow[] = ((ledgerRes.data ?? []) as LedgerJoinRow[]).map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    amount: r.amount,
    reason: r.reason,
    ruleKey: r.rule_key,
    source: r.source,
    sessionId: r.session_id,
    sessionTitle: titleOf(r.sessions),
    isReversal: r.source === "reversal",
    isManualAdjustment: r.source === "manual_adjustment",
  }));

  const seen = new Set<string>();
  const sessionOptions: SessionOption[] = [];
  for (const r of (allRes.data ?? []) as Array<{ session_id: string | null; sessions: LedgerJoinRow["sessions"] }>) {
    if (!r.session_id || seen.has(r.session_id)) continue;
    seen.add(r.session_id);
    const title = titleOf(r.sessions);
    if (title) sessionOptions.push({ id: r.session_id, title });
  }

  return {
    totalPoints: balanceRes.data?.total_points ?? 0,
    rows,
    sessionOptions,
    catalogue: ((rulesRes.data ?? []) as Array<{ action_key: string; points: number; enabled: boolean; reason_ar: string; cap_per_session: number | null }>).map(
      (r) => ({ actionKey: r.action_key, points: r.points, enabled: r.enabled, reasonAr: r.reason_ar, capPerSession: r.cap_per_session }),
    ),
    timeZone: settingsRes.data?.time_zone ?? "Asia/Riyadh",
  };
}

/** The home page's `<PointsStrip>` slot — total points only, own data,
 * ids never rows (`ids` here is just `memberId`, matching every other slot's
 * shape). No heading of its own; the page owns the landmark. */
export interface PointsStripData {
  totalPoints: number;
}

export async function getPointsStripData(locale: string): Promise<PointsStripData> {
  const { session, supabase } = await sessionClient(locale);
  const [{ data: balance }] = await Promise.all([
    supabase.from("points_balances").select("total_points").eq("member_id", session.memberId).maybeSingle(),
  ]);
  return { totalPoints: balance?.total_points ?? 0 };
}
