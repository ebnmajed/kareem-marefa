import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// SCR-063 · /app/admin/settings — REQ-UIX-102, REQ-TEN-008, REQ-TEN-007, REQ-INT-006, REQ-MAT-009, and the reminders'
// saved mark (SCR-060). Admin only, at the data (REQ-ADM-020): every function answers null or `not_permitted` for
// anyone else, and the database refuses them regardless.
//
// ★ Wave 22 (DEC-208): the page's old read and its fourteen-column write (`updateOrgSettings`) are gone with the page.
// That write reported success when it matched no row (D-N2) and wrote every column on every save, so a concurrent edit
// was overwritten and credited to the wrong admin (D-N4). The one write now is `save_org_settings()` (proposed,
// SECURITY INVOKER — the same policies and column grants as a direct write): only the fields that changed, refused when
// another admin changed one since the page opened, in one transaction with the name and the domains, and answering what
// it wrote. `org_settings_history()` (0004), `org_domains_audit()` (0005) and `orgs_rename_audit()` (the lead's) keep
// every record; nothing here writes one.

async function requireAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

/** The page's fields, as the page names them and as `org_settings` stores them. */
export const SETTINGS_COLUMNS = {
  timeZone: "time_zone",
  companyMetric: "company_metric",
  companyMinActiveMembers: "company_min_active_members",
  checkInRotationSeconds: "check_in_rotation_seconds",
  checkInGraceSeconds: "check_in_grace_seconds",
  maxCoPresenters: "max_co_presenters",
  priorityRsvpHours: "priority_rsvp_hours",
  limitDocumentMb: "limit_document_mb",
  limitAudioMb: "limit_audio_mb",
  limitImageMb: "limit_image_mb",
  limitPosterMb: "limit_poster_mb",
  ratingMinAggregate: "rating_min_aggregate",
  emailFromName: "email_from_name",
  emailReplyTo: "email_reply_to",
  allowJpegExport: "allow_jpeg_export",
} as const;
export type SettingsField = keyof typeof SETTINGS_COLUMNS;
export type SettingsValue = string | number | boolean | null;

/** Each field's rule — the column's check constraint (0004, 0175), said before the database has to. */
export const settingsFieldSchemas: Record<SettingsField, z.ZodType<SettingsValue>> = {
  timeZone: z.string().trim().min(1).max(64),
  companyMetric: z.enum(["total_points", "points_per_active_member"]),
  companyMinActiveMembers: z.int().min(1).max(50),
  // ★ wave 27 (0202, REQ-CHK-019): null is «لا يتغيّر» — one code per day, inside the same validity window.
  checkInRotationSeconds: z.int().min(60).max(3600).nullable(),
  checkInGraceSeconds: z.int().min(0).max(600),
  maxCoPresenters: z.int().min(0).max(10),
  priorityRsvpHours: z.int().min(0).max(168),
  limitDocumentMb: z.int().min(1).max(500),
  limitAudioMb: z.int().min(1).max(2000),
  limitImageMb: z.int().min(1).max(100),
  limitPosterMb: z.int().min(1).max(200),
  ratingMinAggregate: z.int().min(1).max(20),
  emailFromName: z.string().trim().max(120).nullable(),
  emailReplyTo: z.email().nullable(),
  allowJpegExport: z.boolean(),
};

export type OrgSettingsView = { [K in SettingsField]: K extends "allowJpegExport" ? boolean : K extends "emailFromName" | "emailReplyTo" ? string | null : K extends "checkInRotationSeconds" ? number | null : K extends "timeZone" | "companyMetric" ? string : number } & {
  name: string;
  domains: { id: string; domain: string }[];
};

/** Everything `063` shows that the org stores, admin only. */
export async function getOrgSettingsView(locale: string): Promise<OrgSettingsView | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;
  const columns = Object.values(SETTINGS_COLUMNS).join(", ");
  const [settings, org, domains] = await Promise.all([
    supabase.from("org_settings").select(columns).eq("org_id", session.orgId).maybeSingle(),
    supabase.from("orgs").select("name").eq("id", session.orgId).maybeSingle(),
    supabase.from("org_domains").select("id, domain").eq("org_id", session.orgId).order("domain"),
  ]);
  if (settings.error) throw new Error(`org_settings: ${settings.error.message}`);
  if (org.error) throw new Error(`orgs: ${org.error.message}`);
  if (domains.error) throw new Error(`org_domains: ${domains.error.message}`);
  if (!settings.data || !org.data) return null;
  const row = settings.data as unknown as Record<string, SettingsValue>;
  const view = Object.fromEntries((Object.keys(SETTINGS_COLUMNS) as SettingsField[]).map((f) => [f, row[SETTINGS_COLUMNS[f]]]));
  return {
    ...(view as Omit<OrgSettingsView, "name" | "domains">),
    name: org.data.name as string,
    domains: ((domains.data ?? []) as Array<{ id: string; domain: string }>).map((d) => ({ id: d.id, domain: d.domain })),
  } as OrgSettingsView;
}

export interface SettingsSaveInput {
  changes: Partial<Record<SettingsField, SettingsValue>>;
  expected: Partial<Record<SettingsField, SettingsValue>>;
  name?: { next: string; expected: string };
  addDomains: string[];
  removeDomains: string[];
}
export type SettingsSaveOutcome =
  | { ok: true; receipt: SaveReceipt }
  | { ok: false; error: "not_permitted" | "not_written" | "stale" | "domain_last" | "domain_taken" | "failed"; fields?: string[] };

/** `063`'s one write — `save_org_settings()`. A refusal is an outcome, never a thrown success. */
export async function saveOrgSettings(locale: string, input: SettingsSaveInput): Promise<SettingsSaveOutcome> {
  const client = await requireAdmin(locale);
  if (!client) return { ok: false, error: "not_permitted" };
  const toColumns = (values: Partial<Record<SettingsField, SettingsValue>>) =>
    Object.fromEntries(Object.entries(values).map(([f, v]) => [SETTINGS_COLUMNS[f as SettingsField], v]));
  const { data, error } = await client.supabase.rpc("save_org_settings", {
    p_changes: toColumns(input.changes),
    p_expected: toColumns(input.expected),
    p_name: input.name?.next ?? null,
    p_expected_name: input.name?.expected ?? null,
    p_add_domains: input.addDomains,
    p_remove_domains: input.removeDomains,
  });
  if (error) {
    // `org_domains_not_another_orgs` (0212, DEC-266): a domain another org holds is the platform's to add, never an admin's.
    if (error.message.includes("domain_taken")) return { ok: false, error: "domain_taken" };
    return { ok: false, error: error.code === "42501" ? "not_permitted" : "failed" };
  }
  const answer = data as { ok: boolean; error?: string; fields?: string[]; at?: string; wrote?: string[] };
  if (!answer.ok) {
    const known = ["not_permitted", "not_written", "stale", "domain_last"] as const;
    const code = (known as readonly string[]).includes(answer.error ?? "") ? (answer.error as (typeof known)[number]) : "failed";
    const byColumn = new Map(Object.entries(SETTINGS_COLUMNS).map(([f, c]) => [c as string, f]));
    return { ok: false, error: code, fields: answer.fields?.map((c) => byColumn.get(c) ?? c) };
  }
  return { ok: true, receipt: { at: answer.at ?? null, wrote: answer.wrote ?? [] } };
}

// ── Wave 22 (`DEC-231` §3, `DEC-232` §3) — what a save wrote, and the last one ─
//
// ★ «It saved» is the server's answer, read from the record the save wrote — never the client's clock and never a URL
// flag. `org_settings_history()` (0004) writes one `scoring_config_history` row per CHANGED column, and it and
// `set_updated_at()` run in the save's transaction, so both read the same `now()`: the rows a save wrote are exactly
// those with `entity_id` = the settings row and `changed_at` = the row's new `updated_at`. An empty set is a save that
// changed nothing, and the page says so. `scoring`'s `053` / `054` share these types (notes/notify.md N10).

/** What one save wrote. `at` is null when nothing was sent because nothing changed. `wrote` [] ⇒ «لم يتغيّر شيء». */
export interface SaveReceipt {
  at: string | null;
  wrote: string[];
}

/** The read-mode mark: the newest save that touched these fields. */
export interface SavedMark {
  at: string;
  /** The org's, to format `at` in (REQ-INT-003). */
  timeZone: string;
  actor: { id: string; displayName: string | null } | null;
}

/**
 * `REQ-UIX-091`: the last save among `fields`, with its actor. Ordered by `changed_at` on purpose: the rows one save
 * wrote share it, and the newest of them is the save — the group, not «the last row» (wave 9's trap is about telling
 * rows written together apart, which this never does). Admin only, as the history's own policy is (`0004:369`).
 */
export async function getLastSave(locale: string, fields: readonly string[]): Promise<SavedMark | null> {
  const client = await requireAdmin(locale);
  if (!client || fields.length === 0) return null;
  const { session, supabase } = client;

  const [history, settings] = await Promise.all([
    supabase
      .from("scoring_config_history")
      .select("changed_at, actor_id")
      .eq("org_id", session.orgId)
      .eq("scope", "org_settings")
      .in("field", [...fields])
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (history.error) throw new Error(`scoring_config_history: ${history.error.message}`);
  if (settings.error) throw new Error(`org_settings: ${settings.error.message}`);
  if (!history.data) return null;

  const actorId = history.data.actor_id as string | null;
  let actor: SavedMark["actor"] = null;
  if (actorId) {
    // The member tier only — the column grant cannot leak an address (0004).
    const { data, error } = await supabase.from("members_member_view").select("display_name").eq("id", actorId).maybeSingle();
    if (error) throw new Error(`members_member_view: ${error.message}`);
    actor = { id: actorId, displayName: (data?.display_name as string | null | undefined) ?? null };
  }
  return { at: history.data.changed_at as string, timeZone: (settings.data?.time_zone as string | undefined) ?? "Asia/Riyadh", actor };
}

/**
 * `063`'s mark reads BOTH stores (DEC-231 §4): a setting lands in the history, the name and the domains in `audit_log`.
 * The newer of the two is the last save; its actor is named the same way.
 */
export async function getLastSettingsSave(locale: string, fields: readonly string[], actions: readonly string[]): Promise<SavedMark | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;
  const [history, audit, settings] = await Promise.all([
    supabase
      .from("scoring_config_history")
      .select("changed_at, actor_id")
      .eq("org_id", session.orgId)
      .eq("scope", "org_settings")
      .in("field", [...fields])
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("audit_log").select("occurred_at, actor_id").eq("org_id", session.orgId).in("action", [...actions]).order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (history.error) throw new Error(`scoring_config_history: ${history.error.message}`);
  if (audit.error) throw new Error(`audit_log: ${audit.error.message}`);
  if (settings.error) throw new Error(`org_settings: ${settings.error.message}`);
  const candidates = [
    history.data ? { at: history.data.changed_at as string, actorId: history.data.actor_id as string | null } : null,
    audit.data ? { at: audit.data.occurred_at as string, actorId: audit.data.actor_id as string | null } : null,
  ].filter((c): c is { at: string; actorId: string | null } => c !== null);
  if (candidates.length === 0) return null;
  const last = candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  let actor: SavedMark["actor"] = null;
  if (last.actorId) {
    const { data, error } = await supabase.from("members_member_view").select("display_name").eq("id", last.actorId).maybeSingle();
    if (error) throw new Error(`members_member_view: ${error.message}`);
    actor = { id: last.actorId, displayName: (data?.display_name as string | null | undefined) ?? null };
  }
  return { at: last.at, timeZone: (settings.data?.time_zone as string | undefined) ?? "Asia/Riyadh", actor };
}
