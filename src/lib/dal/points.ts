import "server-only";
import { cache } from "react";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { currentStreak } from "@/lib/dal/recognition";
import { getMonthlyStanding, type BoardMoment, type WeekNeighbour, type WeekPeriod } from "@/lib/dal/leaderboards";

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

/** One completed multi-day session whose attendance award did not happen, and
 *  the days that explain why (`REQ-SES-017`: «the member can see why»).
 *
 *  ★ This is NOT a ledger row and never will be. The ledger records points, not
 *  explanations, and no row is written for an award that did not happen — so an
 *  absence would otherwise be invisible, which is the one thing `REQ-PTS-003`'s
 *  promise cannot survive. `05` §8 set the precedent: a capped sixth comment
 *  writes no row either, and the cap is explained in place. */
export interface MissedAttendance {
  sessionId: string;
  sessionTitle: string;
  /** When the session completed — where this sits among the ledger rows. */
  completedAt: string;
  /** How many days the session had, for «one of three». */
  dayCount: number;
  /** The days they did not attend, in day order. */
  days: { position: number; startsAt: string }[];
}

export interface PointsHistory {
  totalPoints: number;
  rows: PointsLedgerRow[];
  /** Empty for a one-day session, always — so a one-day history renders
   *  exactly as it does today. */
  missed: MissedAttendance[];
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

  const [ledgerRes, balanceRes, allRes, settingsRes, rulesRes, missedRes] = await Promise.all([
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
    // REQ-SES-017's missed-day line. One call, never one per session: the
    // function returns every missed day of every completed multi-day session
    // the caller attended in part. It takes no member — it reads the caller's
    // own claims, which is what lets it be `security definer` (it has to call
    // the attendance predicate) without becoming a way to ask about anyone
    // else. A one-day session never appears.
    supabase.rpc("missed_attendance_days"),
  ]);
  if (ledgerRes.error) throw new Error(`points_ledger: ${ledgerRes.error.message}`);
  if (allRes.error) throw new Error(`points_ledger (sessions): ${allRes.error.message}`);
  if (rulesRes.error) throw new Error(`scoring_rules: ${rulesRes.error.message}`);
  if (missedRes.error) throw new Error(`missed_attendance_days: ${missedRes.error.message}`);

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

  // Grouped by session, and held to the SAME filters as the ledger rows — a
  // filtered view that still showed every other session's missed days would be
  // a different screen from the one the member asked for.
  type MissedRow = {
    session_id: string;
    session_title: string;
    session_completed_at: string;
    day_count: number;
    day_position: number;
    day_starts_at: string;
  };
  const missedBySession = new Map<string, MissedAttendance>();
  for (const r of (missedRes.data ?? []) as MissedRow[]) {
    if (filters.sessionId && r.session_id !== filters.sessionId) continue;
    if (range && (r.session_completed_at < range.gte || r.session_completed_at >= range.lt)) continue;
    const existing = missedBySession.get(r.session_id);
    const day = { position: r.day_position, startsAt: r.day_starts_at };
    if (existing) {
      existing.days.push(day);
    } else {
      missedBySession.set(r.session_id, {
        sessionId: r.session_id,
        sessionTitle: r.session_title,
        completedAt: r.session_completed_at,
        dayCount: r.day_count,
        days: [day],
      });
    }
  }

  return {
    totalPoints: balanceRes.data?.total_points ?? 0,
    rows,
    missed: [...missedBySession.values()],
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

/** A day, as contract 7's `dayName()` takes it — the same shape as `MissedAttendance.days`. */
export interface AwardDay {
  position: number;
  startsAt: string;
}

/** Contract 1 (`REQ-CHK-018`, `REQ-PTS-015`, `DEC-172`): the caller's own attendance award for one
 *  session, as `checkin` renders it on SCR-014 and the event page.
 *
 *  ★ COMPUTED, NEVER STORED. `session_award_state()` reads the rules, the days, the check-ins and the
 *  ledger and writes nothing; a second ledger with a pending state would be two sources of truth for a
 *  balance invariant 9 exists to keep recomputable. `pending` means the completion pass WILL write
 *  `points` — the function and `award_points()` share every condition, the presenter bar included
 *  (`attendance_award_barred()`), so the amount shown is the one that is paid. */
export type SessionAwardState =
  | { state: "none" }
  | { state: "pending"; points: number; daysAttended: number; daysRequired: number; dayCount: number }
  | { state: "paid"; points: number }
  | { state: "incomplete"; missedDays: AwardDay[]; daysAttended: number; daysRequired: number; dayCount: number };

type AwardStateRow = {
  state: "none" | "pending" | "paid" | "incomplete";
  points: number;
  days_attended: number;
  days_required: number;
  day_count: number;
  missed_days: { position: number; starts_at: string }[] | null;
};

/** The row the function returns, as the DTO — exported for its unit test only. */
export function toSessionAwardState(row: AwardStateRow): SessionAwardState {
  switch (row.state) {
    case "pending":
      return { state: "pending", points: row.points, daysAttended: row.days_attended, daysRequired: row.days_required, dayCount: row.day_count };
    case "paid":
      return { state: "paid", points: row.points };
    case "incomplete":
      return {
        state: "incomplete",
        missedDays: (row.missed_days ?? []).map((d) => ({ position: d.position, startsAt: d.starts_at })),
        daysAttended: row.days_attended,
        daysRequired: row.days_required,
        dayCount: row.day_count,
      };
    default:
      return { state: "none" };
  }
}

/** Null when the session is not visible to the caller — another org's, or none at all, which the
 *  function does not tell apart — and for a malformed id, refused here before any round trip. A failed
 *  RPC throws, as everything in this module does; the caller decides what a failure renders. Request-
 *  scoped `cache()`: SCR-014 and the event page's card ask once between them. */
export const getSessionAwardState = cache(async (locale: string, sessionId: string): Promise<SessionAwardState | null> => {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("session_award_state", { p_session: sessionId });
  if (error) throw new Error(`session_award_state: ${error.message}`);
  const rows = (data ?? []) as AwardStateRow[];
  return rows.length > 0 ? toSessionAwardState(rows[0]) : null;
});

// ── The head of SCR-022 — moments 3 and 4 (wave 16, add-only) ────────────────
//
// `REQ-UIX-047`, `DEC-195` §2.2 / §2.6, `DEC-197` §6 – §7. The balance, the streak,
// the level and its bar — and whether the member has SEEN them. What they last
// saw is `member_seen_marks` (0162), a cursor with no timestamp, read here under
// its own-row policy. ★ Nothing here writes during a render: `markPointsSeen()`
// is called by the client that showed the moment, with the values it showed.
//
// ★ What a balance, a level or a streak IS does not change here. The level is
// `points_balances.current_level_id` as the nightly `evaluate_levels_perks()`
// left it — never recomputed from the balance — so on the day a session pays
// the bar can reach its end with no new level: the card turns over on the
// first visit after the night (`DEC-197` §7, D-29).

/** The sources a completion pass writes (`REQ-PTS-015`): moment 3 plays for these rows and for no other gain
 *  (`DEC-197` §7, D-25). A comment, a photo, a rating bonus, a streak or a manual adjustment moves the balance,
 *  quietly. One list, here. */
export const COMPLETION_SOURCES = ["check_in", "proposal_accepted", "session_delivered", "attendee_bonus"] as const;

export interface HeadLevel {
  id: string;
  /** `levels.sort_order` — the level card's ramp stop, never the name (`REQ-REC-003`). */
  tier: number;
  name: string;
  threshold: number;
  /** The perk KEYS the org has ENABLED at this level; the screen names them. Empty in a default org. */
  unlocks: string[];
}

/** The mark this page will write once the member has seen it. */
export interface PointsMark {
  entryId: string | null;
  total: number;
  levelId: string | null;
}

export interface PointsHead {
  totalPoints: number;
  /** The level held — null until the nightly evaluation has run once for this member. */
  level: HeadLevel | null;
  /** The next level above the one held; null at the top. */
  next: { name: string; threshold: number } | null;
  /** The bar's truth: points into the level held, out of the level's span. Full at the top. */
  progress: { value: number; max: number } | null;
  /** `requiredPerMonth` is wave 18's, add-only: the enabled rule's `required_count` — what keeps a month in the run. */
  streak: { enabled: boolean; months: number; requiredPerMonth?: number };
  /** Moment 3's occurrence, or null (`DEC-197` §7). */
  completion: { occurrenceId: string; from: number; to: number; delta: number; fromProgress: number } | null;
  /** Moment 4's occurrence, or null: the level last seen, now left behind. */
  levelUp: { occurrenceId: string; held: HeadLevel } | null;
  /** Whether the stored mark differs from `mark` — the client acknowledges only then. */
  needsMark: boolean;
  mark: PointsMark;
  /** wave 18 (add-only): what the stored mark holds — null with no mark. The week passes its level through (DEC-207 §1.3). */
  seen?: PointsMark | null;
}

/** The bar's value — the balance out of the next level's threshold, EXACTLY the numbers its line says («120 من 300»).
 *  ★ The picture and the words state one fraction (the lead's 390 px finding: a bar measured within the level's band
 *  drew 10 % beside a line that said 40 %). Full at the top; `null` with no level. Exported for its unit test. */
export function levelProgress(total: number, level: { threshold: number } | null, next: { threshold: number } | null): { value: number; max: number } | null {
  if (!level) return null;
  if (!next || next.threshold <= 0) return { value: 1, max: 1 };
  return { value: Math.min(next.threshold, Math.max(0, total)), max: next.threshold };
}

type SeenRow = { points_entry_id: string | null; points_total: number | null; level_id: string | null };

/** Moment 3's rule, as a pure function — exported for its unit test.
 *  No mark: the first sight writes a baseline and plays nothing, so no member is greeted by their whole history.
 *  A net decrease, no change, or a gain with no completion row: nothing plays. */
export function decideCompletion(
  seen: SeenRow | null,
  now: { entryId: string | null; total: number },
  unseenCompletionRow: boolean,
): { occurrenceId: string; from: number; to: number; delta: number } | null {
  if (!seen || seen.points_total === null || !now.entryId) return null;
  if (seen.points_entry_id === now.entryId) return null;
  if (now.total <= seen.points_total) return null;
  if (!unseenCompletionRow) return null;
  return { occurrenceId: now.entryId, from: seen.points_total, to: now.total, delta: now.total - seen.points_total };
}

/** Moment 4's rule — exported for its unit test. Only a level last SEEN and now left for a HIGHER one turns the card;
 *  the first level a member is given is where they start, not a promotion. */
export function decideLevelUp(seenLevel: { id: string; tier: number } | null, now: { id: string; tier: number } | null): boolean {
  return Boolean(seenLevel && now && seenLevel.id !== now.id && now.tier > seenLevel.tier);
}

export async function getPointsHead(locale: string): Promise<PointsHead> {
  const { session, supabase } = await sessionClient(locale);

  const [balanceRes, levelsRes, perksRes, streakRulesRes, streaksRes, seenRes] = await Promise.all([
    supabase.from("points_balances").select("total_points, last_entry_id, current_level_id").eq("member_id", session.memberId).maybeSingle(),
    supabase.from("levels").select("id, name, threshold_points, sort_order").eq("org_id", session.orgId).order("threshold_points"),
    supabase.from("perks").select("key, required_level_id").eq("org_id", session.orgId).eq("enabled", true).not("required_level_id", "is", null),
    supabase.from("streak_rules").select("id, required_count").eq("org_id", session.orgId).eq("enabled", true).order("required_count").limit(1),
    supabase.from("streak_awards").select("period_start").eq("member_id", session.memberId).order("period_start", { ascending: false }).limit(36),
    supabase.from("member_seen_marks").select("points_entry_id, points_total, level_id").eq("member_id", session.memberId).maybeSingle(),
  ]);
  if (balanceRes.error) throw new Error(`points_balances: ${balanceRes.error.message}`);
  if (levelsRes.error) throw new Error(`levels: ${levelsRes.error.message}`);
  if (perksRes.error) throw new Error(`perks: ${perksRes.error.message}`);
  if (streakRulesRes.error) throw new Error(`streak_rules: ${streakRulesRes.error.message}`);
  if (streaksRes.error) throw new Error(`streak_awards: ${streaksRes.error.message}`);
  if (seenRes.error) throw new Error(`member_seen_marks: ${seenRes.error.message}`);

  const total = balanceRes.data?.total_points ?? 0;
  const entryId = (balanceRes.data?.last_entry_id as string | null | undefined) ?? null;
  const currentLevelId = (balanceRes.data?.current_level_id as string | null | undefined) ?? null;

  const unlocksOf = new Map<string, string[]>();
  for (const p of (perksRes.data ?? []) as Array<{ key: string; required_level_id: string }>) {
    unlocksOf.set(p.required_level_id, [...(unlocksOf.get(p.required_level_id) ?? []), p.key]);
  }
  const levels: HeadLevel[] = ((levelsRes.data ?? []) as Array<{ id: string; name: string; threshold_points: number; sort_order: number }>).map((l) => ({
    id: l.id,
    tier: l.sort_order,
    name: l.name,
    threshold: l.threshold_points,
    unlocks: unlocksOf.get(l.id) ?? [],
  }));
  const level = levels.find((l) => l.id === currentLevelId) ?? null;
  const nextLevel = level ? (levels.find((l) => l.threshold > level.threshold) ?? null) : null;
  const next = nextLevel ? { name: nextLevel.name, threshold: nextLevel.threshold } : null;

  const seen = (seenRes.data as SeenRow | null) ?? null;
  const seenLevel = seen?.level_id ? (levels.find((l) => l.id === seen.level_id) ?? null) : null;

  // Only when the mark says something is unseen is the ledger asked which rows those are.
  let unseenCompletionRow = false;
  if (seen && seen.points_total !== null && entryId && seen.points_entry_id !== entryId && total > seen.points_total) {
    let after: string | null = null;
    if (seen.points_entry_id) {
      const { data: seenEntry, error } = await supabase.from("points_ledger").select("occurred_at").eq("id", seen.points_entry_id).maybeSingle();
      if (error) throw new Error(`points_ledger (seen): ${error.message}`);
      after = (seenEntry?.occurred_at as string | undefined) ?? null;
    }
    let q = supabase
      .from("points_ledger")
      .select("id")
      .eq("member_id", session.memberId)
      .gt("amount", 0)
      .in("source", [...COMPLETION_SOURCES])
      .limit(1);
    if (after) q = q.gt("occurred_at", after);
    const { data: rows, error } = await q;
    if (error) throw new Error(`points_ledger (unseen): ${error.message}`);
    unseenCompletionRow = (rows ?? []).length > 0;
  }

  const decided = decideCompletion(seen, { entryId, total }, unseenCompletionRow);
  const levelUp = decideLevelUp(seenLevel, level) && seenLevel && level ? { occurrenceId: level.id, held: seenLevel } : null;

  // Where the bar starts: the balance last seen, out of the threshold it was then heading for — the new level's own,
  // when the card is about to turn.
  const fromProgressOf = (from: number): number => {
    const within = levelUp ? levelUp.held : level;
    const beyond = levelUp ? level : next;
    const p = levelProgress(from, within, beyond);
    return p ? p.value / p.max : 0;
  };

  const mark: PointsMark = { entryId, total, levelId: currentLevelId };
  return {
    totalPoints: total,
    level,
    next,
    progress: levelProgress(total, level, next),
    streak: {
      enabled: (streakRulesRes.data ?? []).length > 0,
      months: currentStreak((streaksRes.data ?? []).map((r) => r.period_start as string)),
      requiredPerMonth: (streakRulesRes.data?.[0]?.required_count as number | undefined) ?? undefined,
    },
    completion: decided ? { ...decided, fromProgress: fromProgressOf(decided.from) } : null,
    levelUp,
    needsMark: !seen || seen.points_entry_id !== entryId || seen.points_total !== total || seen.level_id !== currentLevelId,
    mark,
    seen: seen ? { entryId: seen.points_entry_id, total: seen.points_total ?? 0, levelId: seen.level_id } : null,
  };
}

const PointsMarkInput = z.object({
  entryId: z.uuid().nullable(),
  total: z.number().int(),
  levelId: z.uuid().nullable(),
});

/** Called by the client that showed the head — never by a render (`DEC-195` §2.6). The values are the ones it
 *  showed; the function writes the caller's own row only, so a well-formed value names nobody else's. */
export async function markPointsSeen(locale: string, input: PointsMark): Promise<void> {
  const parsed = PointsMarkInput.parse(input);
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("mark_points_seen", { p_entry: parsed.entryId, p_total: parsed.total, p_level: parsed.levelId });
  if (error) throw new Error(`mark_points_seen: ${error.message}`);
}

// ── The member's week, for the home (wave 18, add-only) ──────────────────────
//
// `REQ-UIX-055`, `DEC-206` §4.47 – §4.49 and §5, `DEC-207` §1 — contract 4. Rank,
// streak, points and the way to the next level, for the phone's HUD and the
// desktop's game rail. ★ COMPUTED, NEVER STORED, and what each figure IS is
// unchanged: the rank is the MONTHLY board's (there is no weekly one), the streak
// is `streak_awards` counted in months (there is no skip), the level is the one the
// nightly evaluation stored.
//
// ★ Moments 3 and 5 on the week are the SAME occurrences `SCR-022` and the monthly
// board decide — one function each, one id each — so whichever surface a member
// opens first plays and the other is silent (`DEC-206` §5).
//
// ★★ The level is PASSED THROUGH (`DEC-207` §1.3). `mark_points_seen()` writes the
// entry, the total and the level at once; were the week to acknowledge moment 3
// with the level held now, `SCR-022`'s level card would never turn. So the week's
// mark carries the level LAST SEEN — the one a pending level-up is measured from —
// and the level cursor moves only on `SCR-022`, where moment 4 plays.

export interface MemberWeek {
  /** null: the org has no monthly snapshot yet. */
  period: WeekPeriod | null;
  /** null is an ABSENCE — `rankAbsence` says which. Never 0. */
  rank: { rank: number; monthPoints: number; total: number; above: WeekNeighbour | null } | null;
  rankAbsence: "no_snapshot" | "no_points" | null;
  /** Opted out of leaderboards: the rank is still theirs to see, and hidden from everyone else (REQ-LDR-008). */
  optedOut: boolean;
  /** null: no enabled streak rule. `months` may be 0 — on, none running. */
  streak: { months: number; requiredPerMonth: number } | null;
  /** The live balance — `points_balances.total_points`. */
  points: number;
  level: { name: string; tier: number } | null;
  next: { name: string; threshold: number; remaining: number } | null;
  progress: { value: number; max: number } | null;
  /** Moment 3 — `decideCompletion()`'s answer through `getPointsHead()`, unchanged. */
  completion: PointsHead["completion"];
  /** A level reached and not yet seen on `SCR-022`: the week's bar does not move for it. */
  levelUpPending: boolean;
  /** What the week acknowledges: the entry and total shown, and the level LAST SEEN. */
  pointsMark: PointsMark;
  pointsNeedsMark: boolean;
  /** Moment 5 — `decideBoardMoment("monthly", …)`, the monthly tab's own rule. */
  rankMoment: BoardMoment;
}

/** The week's mark and whether it differs from the stored one — pure, exported for its unit test (DEC-207 §1.3). */
export function weekPointsMark(head: Pick<PointsHead, "mark" | "levelUp" | "seen">): { mark: PointsMark; needsMark: boolean } {
  const levelId = head.levelUp ? head.levelUp.held.id : head.mark.levelId;
  const mark: PointsMark = { entryId: head.mark.entryId, total: head.mark.total, levelId };
  const seen = head.seen ?? null;
  const needsMark = !seen || seen.entryId !== mark.entryId || seen.total !== mark.total || seen.levelId !== mark.levelId;
  return { mark, needsMark };
}

/** Request-scoped: the phone's HUD and the desktop's rail ask once between them. */
export const getMemberWeek = cache(async (locale: string): Promise<MemberWeek> => {
  const [head, standing] = await Promise.all([getPointsHead(locale), getMonthlyStanding(locale)]);
  const { mark, needsMark } = weekPointsMark(head);
  return {
    period: standing.period,
    rank: standing.rank,
    rankAbsence: standing.rankAbsence,
    optedOut: standing.optedOut,
    streak: head.streak.enabled ? { months: head.streak.months, requiredPerMonth: head.streak.requiredPerMonth ?? 0 } : null,
    points: head.totalPoints,
    level: head.level ? { name: head.level.name, tier: head.level.tier } : null,
    next: head.next ? { ...head.next, remaining: Math.max(0, head.next.threshold - head.totalPoints) } : null,
    progress: head.progress,
    completion: head.completion,
    levelUpPending: head.levelUp !== null,
    pointsMark: mark,
    pointsNeedsMark: needsMark,
    rankMoment: standing.moment,
  };
});
