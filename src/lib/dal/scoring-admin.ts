import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import type { NumeralSystem } from "@/components/sessions/numerals";

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
  field: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
  changedAt: string;
}

export interface ScoringAdminData {
  rules: ScoringRule[];
  history: ConfigHistoryRow[];
  numerals: NumeralSystem;
}

function cooldownToSeconds(pg: string | null): number | null {
  // postgres returns an interval as e.g. "00:01:00" for select ...::text,
  // but the JS client here reads it back through PostgREST as a string
  // like "PT1M" or "00:01:00" depending on driver settings — parsed
  // defensively rather than assumed.
  if (!pg) return null;
  const hms = /^(\d+):(\d{2}):(\d{2})/.exec(pg);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  return null;
}

export async function getScoringAdminData(locale: string): Promise<ScoringAdminData | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const [{ data: rules, error }, { data: history, error: historyError }, { data: settings }] = await Promise.all([
    supabase
      .from("scoring_rules")
      .select("id, action_key, actor, points, enabled, cap_per_session, cooldown, reason_ar, version")
      .eq("org_id", session.orgId)
      .order("action_key"),
    supabase
      .from("scoring_config_history")
      .select("field, old_value, new_value, actor_id, changed_at")
      .eq("org_id", session.orgId)
      .eq("scope", "scoring")
      .order("changed_at", { ascending: false })
      .limit(50),
    supabase.from("org_settings").select("numerals").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (error) throw new Error(`scoring_rules: ${error.message}`);
  if (historyError) throw new Error(`scoring_config_history: ${historyError.message}`);

  return {
    rules: (rules ?? []).map((r) => ({
      id: r.id,
      actionKey: r.action_key,
      actor: r.actor,
      points: r.points,
      enabled: r.enabled,
      capPerSession: r.cap_per_session,
      cooldownSeconds: cooldownToSeconds(r.cooldown as unknown as string | null),
      reasonAr: r.reason_ar,
      version: r.version,
    })),
    history: (history ?? []).map((h) => ({ field: h.field, oldValue: h.old_value, newValue: h.new_value, actorId: h.actor_id, changedAt: h.changed_at })),
    numerals: (settings?.numerals as NumeralSystem) ?? "western",
  };
}

export const scoringRuleUpdateInput = z.object({
  ruleId: z.uuid(),
  points: z.number().int().min(-1000).max(1000),
  enabled: z.boolean(),
  capPerSession: z.number().int().min(1).max(1000).nullable(),
  cooldownSeconds: z.number().int().min(0).max(31536000).nullable(),
});
export type ScoringRuleUpdateInput = z.infer<typeof scoringRuleUpdateInput>;

/** A plain table UPDATE — 0027's column grant plus its `p2_admin_update`
 * policy is the whole boundary; `scoring_rules_before_update` bumps the
 * version and `scoring_rules_history` (both 0027) log the change without
 * this function doing anything but the UPDATE. */
export async function updateScoringRule(locale: string, input: ScoringRuleUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { supabase } = client;
  const { error } = await supabase
    .from("scoring_rules")
    .update({
      points: input.points,
      enabled: input.enabled,
      cap_per_session: input.capPerSession,
      cooldown: input.cooldownSeconds != null ? `${input.cooldownSeconds} seconds` : null,
    })
    .eq("id", input.ruleId);
  if (error) throw new Error(`scoring_rules: ${error.message}`);
}

export const manualAdjustmentInput = z.object({
  memberId: z.uuid(),
  amount: z.number().int().refine((n) => n !== 0, "amount_required"),
  reason: z.string().trim().min(1).max(300),
});
export type ManualAdjustmentInput = z.infer<typeof manualAdjustmentInput>;

export async function submitManualAdjustment(locale: string, input: ManualAdjustmentInput): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("adjust_points_manually", { p_member: input.memberId, p_amount: input.amount, p_reason: input.reason });
  if (error) throw new Error(`adjust_points_manually: ${error.message}`);
}

// ── Recognition (SCR-054) ───────────────────────────────────────────────────

export interface BadgeRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  issuesCertificate: boolean;
  retiredAt: string | null;
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

export async function getRecognitionAdminData(locale: string): Promise<RecognitionAdminData | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const [{ data: badges, error: e1 }, { data: levels, error: e2 }, { data: perks, error: e3 }, { data: streakRules, error: e4 }] = await Promise.all([
    supabase.from("badges").select("id, key, name, description, rule, issues_certificate, retired_at").eq("org_id", session.orgId).order("key"),
    supabase.from("levels").select("id, name, threshold_points, sort_order").eq("org_id", session.orgId).order("sort_order"),
    supabase
      .from("perks")
      .select("id, key, enabled, levels:required_level_id(name), badges:required_badge_id(name)")
      .eq("org_id", session.orgId)
      .order("key"),
    supabase.from("streak_rules").select("id, key, required_count, bonus_points, enabled").eq("org_id", session.orgId).order("key"),
  ]);
  if (e1) throw new Error(`badges: ${e1.message}`);
  if (e2) throw new Error(`levels: ${e2.message}`);
  if (e3) throw new Error(`perks: ${e3.message}`);
  if (e4) throw new Error(`streak_rules: ${e4.message}`);

  const nameOf = (rel: { name: string } | { name: string }[] | null): string | null => (Array.isArray(rel) ? (rel[0]?.name ?? null) : (rel?.name ?? null));

  return {
    badges: (badges ?? []).map((b) => ({
      id: b.id,
      key: b.key,
      name: b.name,
      description: b.description,
      issuesCertificate: b.issues_certificate,
      retiredAt: b.retired_at,
      isManual: (b.rule as { metric?: string } | null)?.metric === "manual",
    })),
    levels: (levels ?? []).map((l) => ({ id: l.id, name: l.name, thresholdPoints: l.threshold_points, sortOrder: l.sort_order })),
    perks: (perks ?? []).map((p) => ({
      id: p.id,
      key: p.key,
      enabled: p.enabled,
      requiredLevelName: nameOf(p.levels as never),
      requiredBadgeName: nameOf(p.badges as never),
    })),
    streakRules: (streakRules ?? []).map((s) => ({ id: s.id, key: s.key, requiredCount: s.required_count, bonusPoints: s.bonus_points, enabled: s.enabled })),
  };
}

export const badgeUpdateInput = z.object({
  badgeId: z.uuid(),
  description: z.string().trim().max(300).nullable(),
  issuesCertificate: z.boolean(),
  retired: z.boolean(),
});
export type BadgeUpdateInput = z.infer<typeof badgeUpdateInput>;

export async function updateBadge(locale: string, input: BadgeUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { supabase } = client;
  const { error } = await supabase
    .from("badges")
    .update({ description: input.description, issues_certificate: input.issuesCertificate, retired_at: input.retired ? new Date().toISOString() : null })
    .eq("id", input.badgeId);
  if (error) throw new Error(`badges: ${error.message}`);
}

export const perkUpdateInput = z.object({ perkId: z.uuid(), enabled: z.boolean() });
export type PerkUpdateInput = z.infer<typeof perkUpdateInput>;

export async function updatePerk(locale: string, input: PerkUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { error } = await client.supabase.from("perks").update({ enabled: input.enabled }).eq("id", input.perkId);
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

export const levelUpdateInput = z.object({ levelId: z.uuid(), thresholdPoints: z.number().int().min(0).max(1_000_000) });
export type LevelUpdateInput = z.infer<typeof levelUpdateInput>;

export async function updateLevel(locale: string, input: LevelUpdateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_an_admin");
  const { error } = await client.supabase.from("levels").update({ threshold_points: input.thresholdPoints }).eq("id", input.levelId);
  if (error) throw new Error(`levels: ${error.message}`);
}

export const manualBadgeAwardInput = z.object({ memberId: z.uuid(), badgeId: z.uuid(), reason: z.string().trim().min(1).max(300) });
export type ManualBadgeAwardInput = z.infer<typeof manualBadgeAwardInput>;

export async function submitManualBadgeAward(locale: string, input: ManualBadgeAwardInput): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("award_badge_manually", { p_member: input.memberId, p_badge: input.badgeId, p_reason: input.reason });
  if (error) throw new Error(`award_badge_manually: ${error.message}`);
}
