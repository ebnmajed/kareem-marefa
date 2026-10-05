import "server-only";
import { z } from "zod";
import type { SaveReceipt, SavedMark } from "@/lib/dal/admin-settings";
import { avatarHref } from "@/lib/dal/avatars";
import { sessionClient } from "@/lib/dal/session";

// SCR-053 (scoring) and SCR-054 (recognition) admin screens — DEC-046's
// wave-2 carve-out for `scoring`; `console` inherits these paths at wave 3,
// the same pattern DEC-042 set for `sessions`.
//
// Every WRITE here either goes through a table column already granted to
// `authenticated` and gated by an `is_org_admin()` RLS policy (scoring_rules,
// badges, levels, perks, streak_rules — 0027), or through an
// `assert_fresh_admin()`-gated RPC that re-checks the caller regardless of
// what this module thinks the session's role is (adjust_points_manually,
// award_badge_manually). `assertAdmin()` below is UX only — it lets the
// screen 404 early for a non-admin — never the security boundary.

async function assertAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

/** The catalogue's fixed set, grouped as SCR-053 shows it (`0027`'s check constraint is the set). */
export const REWARD_ATTENDEE_ACTIONS = ["check_in", "rating_submitted", "comment", "photo", "streak_month"] as const;
export const REWARD_PRESENTER_ACTIONS = ["proposal_accepted", "session_delivered", "attendee_bonus", "rating_bonus", "materials_uploaded"] as const;
/** `REQ-PTS-008`: seeded at 0 — «مغلقة افتراضيًا». An admin decides which cost points. */
export const PENALTY_ACTIONS = ["no_show", "late_cancellation", "comment_removed", "photo_removed"] as const;

export interface ScoringRule {
  id: string;
  actionKey: string;
  actor: "attendee" | "presenter" | "system" | "admin";
  points: number;
  enabled: boolean;
  capPerSession: number | null;
  cooldownSeconds: number | null;
  reasonAr: string;
  version: number;
}

export interface ConfigHistoryRow {
  id: string;
  scope: "scoring" | "company_scoring";
  /** The rule the change was made to — its `action_key`, or null for a rule no longer in the catalogue. */
  actionKey: string | null;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
  actorName: string | null;
  changedAt: string;
}

export interface ScoringAdminData {
  rules: ScoringRule[];
  // Post-launch — docs/plan/notes/scoring.md "Company points rules":
  // company_scoring_rules, read alongside the member catalogue so the admin
  // screen loads in one round trip, same as everything else here.
  companyRules: CompanyScoringRule[];
  /** Both scopes, newest first — one history, each row naming its rule and its author. */
  history: ConfigHistoryRow[];
  timeZone: string;
}

/**
 * A Postgres interval, as PostgREST prints it, in seconds — `00:01:00`,
 * `24:00:00`, `8760:00:00`, and the `1 day 02:00:00` / `3 days` a writer
 * other than this screen can store. ★ The old parser read only the first
 * shape, so a day-long cooldown read back as «no cooldown», and the next save
 * of that rule would have erased it.
 */
export function intervalToSeconds(pg: string | null): number | null {
  if (!pg) return null;
  const match = /^(?:(\d+) days?)?\s*(?:(\d+):(\d{2}):(\d{2})(?:\.\d+)?)?$/.exec(pg.trim());
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const days = Number(match[1] ?? 0);
  const [h, m, sec] = [match[2], match[3], match[4]].map((v) => Number(v ?? 0));
  return days * 86400 + h * 3600 + m * 60 + sec;
}

export async function getScoringAdminData(locale: string): Promise<ScoringAdminData | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const [
    { data: rules, error },
    { data: history, error: historyError },
    { data: companyRules, error: companyRulesError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    supabase
      .from("scoring_rules")
      .select("id, action_key, actor, points, enabled, cap_per_session, cooldown, reason_ar, version")
      .eq("org_id", session.orgId)
      .order("action_key"),
    supabase
      .from("scoring_config_history")
      .select("id, scope, entity_id, field, old_value, new_value, actor_id, changed_at")
      .eq("org_id", session.orgId)
      .in("scope", ["scoring", "company_scoring"])
      // `version` is bumped by the before-update trigger on EVERY save, so the
      // history trigger logs it as a change of its own — a row that says
      // nothing an admin changed.
      .neq("field", "version")
      .order("changed_at", { ascending: false })
      .limit(50),
    supabase
      .from("company_scoring_rules")
      .select("id, action_key, enabled, points, points_per_percent, cap_points, min_active_members, reason_ar, version")
      .eq("org_id", session.orgId)
      .order("action_key"),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (error) throw new Error(`scoring_rules: ${error.message}`);
  if (historyError) throw new Error(`scoring_config_history: ${historyError.message}`);
  if (companyRulesError) throw new Error(`company_scoring_rules: ${companyRulesError.message}`);
  if (settingsError) throw new Error(`org_settings: ${settingsError.message}`);

  const actionByEntity = new Map<string, string>();
  for (const r of rules ?? []) actionByEntity.set(r.id as string, r.action_key as string);
  for (const r of companyRules ?? []) actionByEntity.set(r.id as string, r.action_key as string);

  const actorIds = Array.from(new Set((history ?? []).map((h) => h.actor_id as string | null).filter((id): id is string => id !== null)));
  const names = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: members, error: membersError } = await supabase.from("members").select("id, display_name").in("id", actorIds);
    if (membersError) throw new Error(`members: ${membersError.message}`);
    for (const m of members ?? []) names.set(m.id as string, m.display_name as string | null);
  }

  return {
    rules: (rules ?? []).map((r) => ({
      id: r.id,
      actionKey: r.action_key,
      actor: r.actor,
      points: r.points,
      enabled: r.enabled,
      capPerSession: r.cap_per_session,
      cooldownSeconds: intervalToSeconds(r.cooldown as unknown as string | null),
      reasonAr: r.reason_ar,
      version: r.version,
    })),
    companyRules: (companyRules ?? []).map((r) => ({
      id: r.id,
      actionKey: r.action_key as CompanyScoringRule["actionKey"],
      enabled: r.enabled,
      points: r.points,
      pointsPerPercent: r.points_per_percent === null ? null : Number(r.points_per_percent),
      capPoints: r.cap_points,
      minActiveMembers: r.min_active_members,
      reasonAr: r.reason_ar,
      version: r.version,
    })),
    history: (history ?? []).map((h) => ({
      id: h.id as string,
      scope: h.scope as ConfigHistoryRow["scope"],
      actionKey: h.entity_id ? (actionByEntity.get(h.entity_id as string) ?? null) : null,
      field: h.field as string,
      oldValue: h.old_value,
      newValue: h.new_value,
      actorId: h.actor_id as string | null,
      actorName: h.actor_id ? (names.get(h.actor_id as string) ?? null) : null,
      changedAt: h.changed_at as string,
    })),
    timeZone: (settings?.time_zone as string | undefined) ?? "Asia/Riyadh",
  };
}

// ── Company rules (post-launch — docs/plan/notes/scoring.md "Company
// points rules") ────────────────────────────────────────────────────────
//
// ★ wave 22: written only through `save_scoring_catalogue()` (invoker — 0081's column grant and p2_admin_update stay
// the boundary); company_scoring_rules_before_update / _history (0081) log the change as scoring_rules' do.

export interface CompanyScoringRule {
  id: string;
  actionKey: "company_hosting" | "company_attendance_pct" | "company_presenting_pct";
  enabled: boolean;
  points: number | null;
  pointsPerPercent: number | null;
  capPoints: number | null;
  minActiveMembers: number | null;
  reasonAr: string;
  version: number;
}

export const manualAdjustmentInput = z.object({
  memberId: z.uuid(),
  amount: z
    .number()
    .int()
    .min(-100000)
    .max(100000)
    .refine((n) => n !== 0, "amount_required"),
  reason: z.string().trim().min(1).max(300),
});
export type ManualAdjustmentInput = z.infer<typeof manualAdjustmentInput>;

/** `adjust_points_manually()`'s refusals (`0032`), as the fields they concern. */
export type ManualAdjustmentRefusal = "reason_required" | "amount_required" | "member_not_found";

export async function submitManualAdjustment(locale: string, input: ManualAdjustmentInput): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("adjust_points_manually", { p_member: input.memberId, p_amount: input.amount, p_reason: input.reason });
  if (!error) return;
  if (error.message.includes("reason_required")) throw new Error("reason_required");
  if (error.message.includes("amount_required")) throw new Error("amount_required");
  if (error.code === "P0002") throw new Error("member_not_found");
  throw new Error(`adjust_points_manually: ${error.message}`);
}

// ── Recognition (SCR-054) ───────────────────────────────────────────────────
//
// ★ Wave 8 (`DEC-147`, K4; the lead's sync-1 ruling Q1). `REQ-REC-001` says an
// admin CREATES, edits, retires and awards badges, each with a name, a
// description, an award rule and a certificate flag; this module could only
// edit a description, the flag and the retirement. `REQ-REC-003` makes level
// titles editable; `REQ-REC-006`/`008` make a perk's qualifying level or badge
// configurable. Every one of those writes is inside grants `0027` already
// gives an `is_org_admin()` caller — no SQL — and `tests/rls/admin-recognition-
// writes.test.ts` proves a moderator is refused each (`REQ-ADM-020`).

/** The metrics `evaluate_badges()` reads (`0088`); anything else it skips. */
export const BADGE_METRICS = ["check_ins_count", "sessions_delivered_count", "ratings_submitted_count", "streak_awards_count", "presenter_rating_avg", "manual"] as const;
export type BadgeMetric = (typeof BADGE_METRICS)[number];

export interface BadgeRule {
  metric: BadgeMetric;
  /** The threshold — a count, or an average from 1 to 5 for `presenter_rating_avg`. Null for `manual`. */
  gte: number | null;
  /** `presenter_rating_avg` only: the least number of delivered sessions. */
  minSessions: number | null;
}

export interface BadgeRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  issuesCertificate: boolean;
  retiredAt: string | null;
  rule: BadgeRule;
  /** Kept for callers that only need to know. */
  isManual: boolean;
  /** ★ wave 22, add-only: the stale check of a save (`DEC-232` §3.3). */
  updatedAt: string;
  /** ★ wave 22, add-only: how many members hold it — a count, never who (`badge_holder_counts()`). */
  holders: number;
}
export interface LevelRow {
  id: string;
  name: string;
  thresholdPoints: number;
  sortOrder: number;
  /** ★ wave 22, add-only. */
  updatedAt: string;
}
export interface PerkRow {
  id: string;
  key: "priority_rsvp" | "can_host";
  enabled: boolean;
  requiredLevelId: string | null;
  requiredBadgeId: string | null;
  requiredLevelName: string | null;
  requiredBadgeName: string | null;
  /** ★ wave 22, add-only. */
  updatedAt: string;
}
export interface StreakRuleRow {
  id: string;
  key: string;
  requiredCount: number;
  bonusPoints: number;
  enabled: boolean;
  /** ★ wave 22, add-only. */
  updatedAt: string;
}

export interface RecognitionAdminData {
  badges: BadgeRow[];
  levels: LevelRow[];
  perks: PerkRow[];
  streakRules: StreakRuleRow[];
}

function badgeRuleFrom(raw: unknown): BadgeRule {
  const rule = (raw ?? {}) as { metric?: string; gte?: number | string; min_sessions?: number | string };
  const metric = (BADGE_METRICS as readonly string[]).includes(rule.metric ?? "") ? (rule.metric as BadgeMetric) : "manual";
  const num = (v: number | string | undefined) => (v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v));
  return { metric, gte: metric === "manual" ? null : num(rule.gte), minSessions: metric === "presenter_rating_avg" ? num(rule.min_sessions) : null };
}

function badgeRuleJson(rule: BadgeRule): Record<string, unknown> {
  if (rule.metric === "manual") return { metric: "manual" };
  if (rule.metric === "presenter_rating_avg") return { metric: rule.metric, gte: rule.gte, min_sessions: rule.minSessions ?? 0 };
  return { metric: rule.metric, gte: rule.gte };
}

export async function getRecognitionAdminData(locale: string): Promise<RecognitionAdminData | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const [{ data: badges, error: e1 }, { data: levels, error: e2 }, { data: perks, error: e3 }, { data: streakRules, error: e4 }, { data: holders, error: e5 }] = await Promise.all([
    supabase.from("badges").select("id, key, name, description, rule, issues_certificate, retired_at, updated_at").eq("org_id", session.orgId).order("created_at").order("key"),
    supabase.from("levels").select("id, name, threshold_points, sort_order, updated_at").eq("org_id", session.orgId).order("sort_order"),
    supabase.from("perks").select("id, key, enabled, required_level_id, required_badge_id, updated_at").eq("org_id", session.orgId).order("key"),
    supabase.from("streak_rules").select("id, key, required_count, bonus_points, enabled, updated_at").eq("org_id", session.orgId).order("key"),
    supabase.rpc("badge_holder_counts"),
  ]);
  if (e1) throw new Error(`badges: ${e1.message}`);
  if (e2) throw new Error(`levels: ${e2.message}`);
  if (e3) throw new Error(`perks: ${e3.message}`);
  if (e4) throw new Error(`streak_rules: ${e4.message}`);
  if (e5) throw new Error(`badge_holder_counts: ${e5.message}`);
  const held = new Map(((holders ?? []) as Array<{ badge_id: string; holders: number }>).map((h) => [h.badge_id, h.holders]));

  const levelName = new Map((levels ?? []).map((l) => [l.id as string, l.name as string]));
  const badgeName = new Map((badges ?? []).map((b) => [b.id as string, b.name as string]));

  return {
    badges: (badges ?? []).map((b) => {
      const rule = badgeRuleFrom(b.rule);
      return {
        id: b.id,
        key: b.key,
        name: b.name,
        description: b.description,
        issuesCertificate: b.issues_certificate,
        retiredAt: b.retired_at,
        rule,
        isManual: rule.metric === "manual",
        updatedAt: b.updated_at as string,
        holders: held.get(b.id as string) ?? 0,
      };
    }),
    levels: (levels ?? []).map((l) => ({ id: l.id, name: l.name, thresholdPoints: l.threshold_points, sortOrder: l.sort_order, updatedAt: l.updated_at as string })),
    perks: (perks ?? []).map((p) => ({
      id: p.id,
      key: p.key,
      enabled: p.enabled,
      requiredLevelId: p.required_level_id,
      requiredBadgeId: p.required_badge_id,
      requiredLevelName: p.required_level_id ? (levelName.get(p.required_level_id) ?? null) : null,
      requiredBadgeName: p.required_badge_id ? (badgeName.get(p.required_badge_id) ?? null) : null,
      updatedAt: p.updated_at as string,
    })),
    streakRules: (streakRules ?? []).map((s) => ({ id: s.id, key: s.key, requiredCount: s.required_count, bonusPoints: s.bonus_points, enabled: s.enabled, updatedAt: s.updated_at as string })),
  };
}

export const badgeRuleInput = z.discriminatedUnion("metric", [
  z.object({ metric: z.literal("manual") }),
  z.object({ metric: z.literal("presenter_rating_avg"), gte: z.number().min(1).max(5), minSessions: z.number().int().min(0).max(1000) }),
  z.object({ metric: z.enum(["check_ins_count", "sessions_delivered_count", "ratings_submitted_count", "streak_awards_count"]), gte: z.number().int().min(1).max(100000) }),
]);

export const badgeInput = z.object({
  /** Absent: a new badge. */
  badgeId: z.uuid().optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).nullable(),
  issuesCertificate: z.boolean(),
  rule: badgeRuleInput,
});
export type BadgeInput = z.infer<typeof badgeInput>;

export const manualBadgeAwardInput = z.object({ memberId: z.uuid(), badgeId: z.uuid(), reason: z.string().trim().min(1).max(300) });
export type ManualBadgeAwardInput = z.infer<typeof manualBadgeAwardInput>;

/**
 * `award_badge_manually()` treats a badge the member already holds as a no-op
 * that still writes an audit row, and the screen used to call that «saved».
 * The holding is read first and returned, so the screen says so instead — and
 * no second audit row is written for an award that did not happen.
 */
export async function submitManualBadgeAward(locale: string, input: ManualBadgeAwardInput): Promise<{ alreadyHeldSince: string | null; alreadyHeldBadge: string | null }> {
  const { supabase } = await sessionClient(locale);
  // The badge's name comes back with the refusal, so the message can name it
  // even when the badge was retired after the page loaded and is no longer in
  // the form's list.
  const { data: held, error: readError } = await supabase.from("member_badges").select("awarded_at, badges(name)").eq("member_id", input.memberId).eq("badge_id", input.badgeId).maybeSingle();
  if (readError) throw new Error(`member_badges: ${readError.message}`);
  if (held) {
    const badge = (Array.isArray(held.badges) ? held.badges[0] : held.badges) as { name: string } | null | undefined;
    return { alreadyHeldSince: held.awarded_at as string, alreadyHeldBadge: badge?.name ?? null };
  }
  const { error } = await supabase.rpc("award_badge_manually", { p_member: input.memberId, p_badge: input.badgeId, p_reason: input.reason });
  if (!error) return { alreadyHeldSince: null, alreadyHeldBadge: null };
  if (error.code === "P0002") throw new Error("not_found");
  if (error.message.includes("reason_required")) throw new Error("reason_required");
  throw new Error(`award_badge_manually: ${error.message}`);
}

// ── Wave 22 — one save, its receipt, and the saved mark (REQ-UIX-091, REQ-UIX-100, REQ-UIX-101, DEC-232 §3) ─────
//
// SCR-053 and SCR-054 are read-mode pages. A save is ONE call to an invoker function (`save_scoring_catalogue()`,
// `save_recognition()`) — today's grants decide, one transaction, only what changed — and its answer is the receipt:
// the history rows it wrote, found by its own transaction instant. A refusal is thrown as the word the screen lands at
// its field; a write that matched nothing is never success.

/** The function's refusals, as `Error.message`s the actions read. */
function saveRefusal(error: { code?: string; message: string }): Error {
  if (error.code === "42501") return new Error("not_an_admin");
  if (error.code === "40001") return new Error("stale");
  if (error.code === "P0002") return new Error("not_found");
  const named = error.message.match(/(sign_mismatch|threshold_order|threshold_taken):[^\s"]+/);
  if (named) return new Error(named[0]);
  return new Error(`save: ${error.message}`);
}

function receiptOf(data: unknown): SaveReceipt {
  const r = (data ?? {}) as { at?: string | null; wrote?: string[] };
  return { at: r.at ?? null, wrote: Array.isArray(r.wrote) ? r.wrote : [] };
}

export const catalogueSaveInput = z.object({
  rules: z
    .array(
      z.object({
        id: z.uuid(),
        version: z.int(),
        points: z.int().min(-1000).max(1000),
        enabled: z.boolean(),
        cap_per_session: z.int().min(1).max(1000).nullable(),
        cooldown_seconds: z.int().min(1).max(31536000).nullable(),
        reason_ar: z.string().trim().min(1).max(200),
      }),
    )
    .max(50),
  company: z
    .array(
      z.object({
        id: z.uuid(),
        version: z.int(),
        enabled: z.boolean(),
        points: z.int().min(0).max(10000).nullable(),
        points_per_percent: z.number().min(0).max(100).nullable(),
        cap_points: z.int().min(1).max(10000).nullable(),
        min_active_members: z.int().min(1).max(1000).nullable(),
      }),
    )
    .max(3),
});
export type CatalogueSaveInput = z.infer<typeof catalogueSaveInput>;

/** SCR-053's one save. Throws `stale`, `sign_mismatch:<action_key>`, `not_found` or `not_an_admin`. */
export async function saveScoringCatalogue(locale: string, input: CatalogueSaveInput): Promise<SaveReceipt> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { data, error } = await client.supabase.rpc("save_scoring_catalogue", { p_rules: input.rules, p_company: input.company });
  if (error) throw saveRefusal(error);
  return receiptOf(data);
}

export const recognitionSaveInput = z.object({
  levels: z.array(z.object({ id: z.uuid(), updatedAt: z.string(), name: z.string().trim().min(1).max(60), thresholdPoints: z.int().min(0).max(1_000_000) })).max(20),
  badges: z
    .array(
      z.object({
        id: z.uuid().nullable(),
        updatedAt: z.string().nullable(),
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(300).nullable(),
        issuesCertificate: z.boolean(),
        rule: z.object({ metric: z.enum(BADGE_METRICS), gte: z.number().nullable(), minSessions: z.number().nullable() }),
        retired: z.boolean(),
      }),
    )
    .max(200),
  perks: z
    .array(z.object({ id: z.uuid(), updatedAt: z.string(), enabled: z.boolean(), requiredLevelId: z.uuid().nullable(), requiredBadgeId: z.uuid().nullable() }))
    .max(10)
    .refine((all) => all.every((p) => (p.requiredLevelId === null) !== (p.requiredBadgeId === null)), "one_qualifier"),
  streaks: z.array(z.object({ id: z.uuid(), updatedAt: z.string(), requiredCount: z.int().min(1).max(31), enabled: z.boolean() })).max(10),
});
export type RecognitionSaveInput = z.infer<typeof recognitionSaveInput>;

/** SCR-054's one save. Never sends `bonus_points` (DEC-232 §4 row 2). Throws `stale`, `threshold_order:<id>`,
 *  `threshold_taken:<id>`, `not_found` or `not_an_admin`. */
export async function saveRecognition(locale: string, input: RecognitionSaveInput): Promise<SaveReceipt> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { data, error } = await client.supabase.rpc("save_recognition", {
    p_levels: input.levels.map((l) => ({ id: l.id, updated_at: l.updatedAt, name: l.name, threshold_points: l.thresholdPoints })),
    p_badges: input.badges.map((b) => ({
      id: b.id,
      updated_at: b.updatedAt,
      name: b.name,
      description: b.description,
      issues_certificate: b.issuesCertificate,
      rule: badgeRuleJson(b.rule),
      retired: b.retired,
    })),
    p_perks: input.perks.map((p) => ({ id: p.id, updated_at: p.updatedAt, enabled: p.enabled, required_level_id: p.requiredLevelId, required_badge_id: p.requiredBadgeId })),
    p_streaks: input.streaks.map((s) => ({ id: s.id, updated_at: s.updatedAt, required_count: s.requiredCount, enabled: s.enabled })),
  });
  if (error) throw saveRefusal(error);
  return receiptOf(data);
}

/**
 * The read-mode mark (`REQ-UIX-091`): the newest save among these history scopes, with its actor. Ordered by
 * `changed_at` on purpose — the rows one save wrote share it, and the newest of them IS the save (the group, never
 * «the last row»; notify's N10 says the same of `getLastSave()`). `version` rows are the trigger's, not an admin's.
 */
export async function getConfigLastSave(locale: string, scopes: readonly ("scoring" | "company_scoring" | "levels" | "badges" | "perks" | "streaks")[]): Promise<SavedMark | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;
  const [history, settings] = await Promise.all([
    supabase
      .from("scoring_config_history")
      .select("changed_at, actor_id")
      .eq("org_id", session.orgId)
      .in("scope", [...scopes])
      .neq("field", "version")
      .not("actor_id", "is", null)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (history.error) throw new Error(`scoring_config_history: ${history.error.message}`);
  if (settings.error) throw new Error(`org_settings: ${settings.error.message}`);
  if (!history.data) return null;
  const actorId = history.data.actor_id as string;
  const { data: actor, error } = await supabase.from("members_member_view").select("display_name").eq("id", actorId).maybeSingle();
  if (error) throw new Error(`members_member_view: ${error.message}`);
  return {
    at: history.data.changed_at as string,
    timeZone: (settings.data?.time_zone as string | undefined) ?? "Asia/Riyadh",
    actor: { id: actorId, displayName: (actor?.display_name as string | null | undefined) ?? null },
  };
}

/**
 * The faces of the members on SCR-054's held certificates (`DEC-099`): each member's same-origin avatar href through
 * the one resolver, or null — never Google's source. `listHeldAchievements()` (designer's) returns the member, not the
 * copy's version, so it is read here, admin-only, for exactly those members.
 */
export async function listAvatarHrefs(locale: string, memberIds: readonly string[]): Promise<Record<string, string | null>> {
  const client = await assertAdmin(locale);
  if (!client || memberIds.length === 0) return {};
  const { data, error } = await client.supabase.from("members").select("id, avatar_version").in("id", [...new Set(memberIds)]);
  if (error) throw new Error(`members: ${error.message}`);
  return Object.fromEntries((data ?? []).map((m) => [m.id as string, avatarHref({ id: m.id as string, avatarVersion: m.avatar_version as number | string | null }, 96)]));
}
