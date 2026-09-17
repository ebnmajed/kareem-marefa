import "server-only";
import { z } from "zod";
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
export const isPenalty = (actionKey: string) => (PENALTY_ACTIONS as readonly string[]).includes(actionKey);

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
  companies: CompanyOption[];
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
    { data: companies, error: companiesError },
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
    supabase.from("companies").select("id, name").eq("org_id", session.orgId).is("deactivated_at", null).order("name"),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (error) throw new Error(`scoring_rules: ${error.message}`);
  if (historyError) throw new Error(`scoring_config_history: ${historyError.message}`);
  if (companyRulesError) throw new Error(`company_scoring_rules: ${companyRulesError.message}`);
  if (companiesError) throw new Error(`companies: ${companiesError.message}`);
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
    companies: companies ?? [],
    timeZone: (settings?.time_zone as string | undefined) ?? "Asia/Riyadh",
  };
}

export const scoringRuleUpdateInput = z.object({
  ruleId: z.uuid(),
  points: z.number().int().min(-1000).max(1000),
  enabled: z.boolean(),
  capPerSession: z.number().int().min(1).max(1000).nullable(),
  cooldownSeconds: z.number().int().min(0).max(31536000).nullable(),
  reasonAr: z.string().trim().min(1).max(200),
});
export type ScoringRuleUpdateInput = z.infer<typeof scoringRuleUpdateInput>;

/** A plain table UPDATE — 0027's column grant plus its `p2_admin_update`
 * policy is the whole boundary; `scoring_rules_before_update` bumps the
 * version and `scoring_rules_history` (both 0027) log the change without
 * this function doing anything but the UPDATE.
 *
 * ★ The sign follows the rule, and nothing in the schema says so: a reward
 * saved negative would take points for attending, and a penalty saved
 * positive would pay for a no-show. The rule's own `action_key` — read here,
 * never taken from the form — decides which way `points` may go. */
export async function updateScoringRule(locale: string, input: ScoringRuleUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { supabase } = client;
  const { data: rule, error: readError } = await supabase.from("scoring_rules").select("action_key").eq("id", input.ruleId).maybeSingle();
  if (readError) throw new Error(`scoring_rules: ${readError.message}`);
  if (!rule) throw new Error("not_found");
  if (isPenalty(rule.action_key as string) ? input.points > 0 : input.points < 0) throw new Error("sign_mismatch");
  const { error } = await supabase
    .from("scoring_rules")
    .update({
      points: input.points,
      enabled: input.enabled,
      cap_per_session: input.capPerSession,
      cooldown: input.cooldownSeconds != null ? `${input.cooldownSeconds} seconds` : null,
      reason_ar: input.reasonAr,
    })
    .eq("id", input.ruleId);
  if (error) throw new Error(`scoring_rules: ${error.message}`);
}

// ── Company rules (post-launch — docs/plan/notes/scoring.md "Company
// points rules") ────────────────────────────────────────────────────────
//
// A plain table UPDATE, same technique as updateScoringRule — 0001's
// column grant plus its p2_admin_update policy is the whole boundary;
// company_scoring_rules_before_update / _history (also 0001) log the
// change the same way scoring_rules already does.

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

export async function getCompanyScoringRules(locale: string): Promise<CompanyScoringRule[] | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;
  const { data, error } = await supabase
    .from("company_scoring_rules")
    .select("id, action_key, enabled, points, points_per_percent, cap_points, min_active_members, reason_ar, version")
    .eq("org_id", session.orgId)
    .order("action_key");
  if (error) throw new Error(`company_scoring_rules: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    actionKey: r.action_key as CompanyScoringRule["actionKey"],
    enabled: r.enabled,
    points: r.points,
    pointsPerPercent: r.points_per_percent,
    capPoints: r.cap_points,
    minActiveMembers: r.min_active_members,
    reasonAr: r.reason_ar,
    version: r.version,
  }));
}

export const companyHostingRuleUpdateInput = z.object({
  ruleId: z.uuid(),
  enabled: z.boolean(),
  points: z.number().int().min(0).max(10000),
});
export type CompanyHostingRuleUpdateInput = z.infer<typeof companyHostingRuleUpdateInput>;

export async function updateCompanyHostingRule(locale: string, input: CompanyHostingRuleUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { error } = await client.supabase
    .from("company_scoring_rules")
    .update({ enabled: input.enabled, points: input.points })
    .eq("id", input.ruleId);
  if (error) throw new Error(`company_scoring_rules: ${error.message}`);
}

export const companyPercentRuleUpdateInput = z.object({
  ruleId: z.uuid(),
  enabled: z.boolean(),
  pointsPerPercent: z.number().min(0).max(100),
  capPoints: z.number().int().min(1).max(10000),
  minActiveMembers: z.number().int().min(1).max(1000),
});
export type CompanyPercentRuleUpdateInput = z.infer<typeof companyPercentRuleUpdateInput>;

export async function updateCompanyPercentRule(locale: string, input: CompanyPercentRuleUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { error } = await client.supabase
    .from("company_scoring_rules")
    .update({
      enabled: input.enabled,
      points_per_percent: input.pointsPerPercent,
      cap_points: input.capPoints,
      min_active_members: input.minActiveMembers,
    })
    .eq("id", input.ruleId);
  if (error) throw new Error(`company_scoring_rules: ${error.message}`);
}

// Stopgap: the scheduling screen (console's app/admin/sessions/**) has no
// "host company" field yet — this is a session ID typed into a text field,
// the same stopgap the manual point adjustment form already uses for a
// member ID (docs/plan/notes/scoring.md flags both for whoever builds the
// real pickers). The write itself is a plain column-grant UPDATE on
// sessions.host_company_id (0001's grant), gated by sessions' own
// sessions_update_admin RLS policy — this module never re-implements that
// check, only 404s the screen early like assertAdmin() does everywhere else.
export const sessionHostCompanyInput = z.object({
  sessionId: z.uuid(),
  companyId: z.uuid().nullable(),
});
export type SessionHostCompanyInput = z.infer<typeof sessionHostCompanyInput>;

export async function setSessionHostCompany(locale: string, input: SessionHostCompanyInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { error } = await client.supabase.from("sessions").update({ host_company_id: input.companyId }).eq("id", input.sessionId);
  if (error) throw new Error(`sessions: ${error.message}`);
}

export interface CompanyOption {
  id: string;
  name: string;
}

export async function listCompaniesForAdmin(locale: string): Promise<CompanyOption[] | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("org_id", session.orgId)
    .is("deactivated_at", null)
    .order("name");
  if (error) throw new Error(`companies: ${error.message}`);
  return data ?? [];
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

export interface HostableSession {
  id: string;
  title: string;
  startsAt: string | null;
  hostCompanyId: string | null;
}

/**
 * The org's sessions, for the host-company picker — newest first, cancelled
 * and archived ones left out. The picker replaced a session id typed into a
 * text field; the company-hosting rule pays on completion, so any session that
 * can still complete, or has, is a candidate.
 */
export async function listHostableSessions(locale: string): Promise<HostableSession[] | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;
  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, starts_at, host_company_id, state")
    .eq("org_id", session.orgId)
    .not("state", "in", "(cancelled,archived)")
    .order("starts_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(`sessions: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    startsAt: r.starts_at as string | null,
    hostCompanyId: r.host_company_id as string | null,
  }));
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
}
export interface LevelRow {
  id: string;
  name: string;
  thresholdPoints: number;
  sortOrder: number;
}
export interface PerkRow {
  id: string;
  key: "priority_rsvp" | "can_host";
  enabled: boolean;
  requiredLevelId: string | null;
  requiredBadgeId: string | null;
  requiredLevelName: string | null;
  requiredBadgeName: string | null;
}
export interface StreakRuleRow {
  id: string;
  key: string;
  requiredCount: number;
  bonusPoints: number;
  enabled: boolean;
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

  const [{ data: badges, error: e1 }, { data: levels, error: e2 }, { data: perks, error: e3 }, { data: streakRules, error: e4 }] = await Promise.all([
    supabase.from("badges").select("id, key, name, description, rule, issues_certificate, retired_at").eq("org_id", session.orgId).order("created_at").order("key"),
    supabase.from("levels").select("id, name, threshold_points, sort_order").eq("org_id", session.orgId).order("sort_order"),
    supabase.from("perks").select("id, key, enabled, required_level_id, required_badge_id").eq("org_id", session.orgId).order("key"),
    supabase.from("streak_rules").select("id, key, required_count, bonus_points, enabled").eq("org_id", session.orgId).order("key"),
  ]);
  if (e1) throw new Error(`badges: ${e1.message}`);
  if (e2) throw new Error(`levels: ${e2.message}`);
  if (e3) throw new Error(`perks: ${e3.message}`);
  if (e4) throw new Error(`streak_rules: ${e4.message}`);

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
      };
    }),
    levels: (levels ?? []).map((l) => ({ id: l.id, name: l.name, thresholdPoints: l.threshold_points, sortOrder: l.sort_order })),
    perks: (perks ?? []).map((p) => ({
      id: p.id,
      key: p.key,
      enabled: p.enabled,
      requiredLevelId: p.required_level_id,
      requiredBadgeId: p.required_badge_id,
      requiredLevelName: p.required_level_id ? (levelName.get(p.required_level_id) ?? null) : null,
      requiredBadgeName: p.required_badge_id ? (badgeName.get(p.required_badge_id) ?? null) : null,
    })),
    streakRules: (streakRules ?? []).map((s) => ({ id: s.id, key: s.key, requiredCount: s.required_count, bonusPoints: s.bonus_points, enabled: s.enabled })),
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

/** Create or edit a badge. A created badge gets a stable key the admin never types. */
export async function saveBadge(locale: string, input: BadgeInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { session, supabase } = client;
  const rule = badgeRuleJson({
    metric: input.rule.metric,
    gte: "gte" in input.rule ? input.rule.gte : null,
    minSessions: "minSessions" in input.rule ? input.rule.minSessions : null,
  });
  const row = { name: input.name, description: input.description, issues_certificate: input.issuesCertificate, rule };
  const { error } = input.badgeId
    ? await supabase.from("badges").update(row).eq("id", input.badgeId)
    : await supabase.from("badges").insert({ ...row, org_id: session.orgId, key: `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}` });
  if (error) throw new Error(`badges: ${error.message}`);
}

/** Retiring never revokes a badge a member holds (`REQ-REC-001`); it stops future awards. */
export async function setBadgeRetired(locale: string, badgeId: string, retired: boolean): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  if (!z.uuid().safeParse(badgeId).success) throw new Error("not_found");
  const { error } = await client.supabase.from("badges").update({ retired_at: retired ? new Date().toISOString() : null }).eq("id", badgeId);
  if (error) throw new Error(`badges: ${error.message}`);
}

export const perkUpdateInput = z
  .object({
    perkId: z.uuid(),
    enabled: z.boolean(),
    requiredLevelId: z.uuid().nullable(),
    requiredBadgeId: z.uuid().nullable(),
  })
  .refine((p) => (p.requiredLevelId === null) !== (p.requiredBadgeId === null), "one_qualifier");
export type PerkUpdateInput = z.infer<typeof perkUpdateInput>;

export async function updatePerk(locale: string, input: PerkUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { error } = await client.supabase
    .from("perks")
    .update({ enabled: input.enabled, required_level_id: input.requiredLevelId, required_badge_id: input.requiredBadgeId })
    .eq("id", input.perkId);
  if (error) throw new Error(`perks: ${error.message}`);
}

export const streakRuleUpdateInput = z.object({
  streakRuleId: z.uuid(),
  requiredCount: z.number().int().min(1).max(31),
  bonusPoints: z.number().int().min(0).max(1000),
  enabled: z.boolean(),
});
export type StreakRuleUpdateInput = z.infer<typeof streakRuleUpdateInput>;

export async function updateStreakRule(locale: string, input: StreakRuleUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { error } = await client.supabase
    .from("streak_rules")
    .update({ required_count: input.requiredCount, bonus_points: input.bonusPoints, enabled: input.enabled })
    .eq("id", input.streakRuleId);
  if (error) throw new Error(`streak_rules: ${error.message}`);
}

export const levelUpdateInput = z.object({
  levelId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  thresholdPoints: z.number().int().min(0).max(1_000_000),
});
export type LevelUpdateInput = z.infer<typeof levelUpdateInput>;

/**
 * A level's title and threshold. The thresholds must still climb with the
 * levels' order — a «كريم معرفة» below «صاحب أثر» is not a ladder — which the
 * schema does not say (it only makes each threshold unique), so it is said
 * here, against the neighbours: `threshold_order`. A threshold another level
 * already has is `threshold_taken`, the unique constraint's `23505`.
 */
export async function updateLevel(locale: string, input: LevelUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { session, supabase } = client;
  const { data: levels, error: readError } = await supabase.from("levels").select("id, threshold_points, sort_order").eq("org_id", session.orgId).order("sort_order");
  if (readError) throw new Error(`levels: ${readError.message}`);
  const index = (levels ?? []).findIndex((l) => l.id === input.levelId);
  if (index < 0) throw new Error("not_found");
  const below = levels![index - 1];
  const above = levels![index + 1];
  if ((below && input.thresholdPoints <= below.threshold_points) || (above && input.thresholdPoints >= above.threshold_points)) {
    if ([below, above].some((l) => l && l.threshold_points === input.thresholdPoints)) throw new Error("threshold_taken");
    throw new Error("threshold_order");
  }
  const { error } = await supabase.from("levels").update({ name: input.name, threshold_points: input.thresholdPoints }).eq("id", input.levelId);
  if (error) throw new Error(error.code === "23505" ? "threshold_taken" : `levels: ${error.message}`);
}

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
