import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// SCR-063 · /app/admin/settings (REQ-TEN-008, REQ-INT-006, REQ-MAT-009).
// No new SQL: `p2_admin_update`'s column grant (0004) already covers every
// field here, and `org_settings_history()` (0004, an `after update`
// trigger) already writes REQ-TEN-008's "actor, timestamp, old value, new
// value" into `scoring_config_history` (`scope = 'org_settings'`, the same
// shared history table `scoring_rules` writes into under `scope =
// 'scoring'`) for every column, on every write, regardless of which
// screen makes it — the same reason `scoring_rules`'s own version bump
// lives in a trigger and not in a DAL (`scoring.md`'s handoff note). This
// screen is a plain admin-gated UPDATE.
//
// `reminder_offsets_minutes`/`rating_prompt_delay_minutes` are `/admin/
// reminders`' own fields (notify, inherited); `perks.enabled` (including
// `priority_rsvp`) is `/admin/recognition`'s. Everything else REQ-TEN-008
// asks for and no other screen already owns lives here.

export interface OrgSettingsAdmin {
  timeZone: string;
  checkInRotationSeconds: number;
  checkInGraceSeconds: number;
  maxCoPresenters: number;
  companyMetric: "total_points" | "points_per_active_member";
  priorityRsvpHours: number;
  limitDocumentMb: number;
  limitAudioMb: number;
  limitImageMb: number;
  limitPosterMb: number;
  allowJpegExport: boolean;
  emailFromName: string | null;
  emailReplyTo: string | null;
  ratingMinAggregate: number;
}

async function requireAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

export async function getOrgSettingsForAdmin(locale: string): Promise<OrgSettingsAdmin | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const { data, error } = await supabase
    .from("org_settings")
    .select(
      "time_zone, check_in_rotation_seconds, check_in_grace_seconds, max_co_presenters, company_metric, priority_rsvp_hours, limit_document_mb, limit_audio_mb, limit_image_mb, limit_poster_mb, allow_jpeg_export, email_from_name, email_reply_to, rating_min_aggregate",
    )
    .eq("org_id", session.orgId)
    .maybeSingle();
  if (error) throw new Error(`org_settings: ${error.message}`);
  if (!data) return null;

  return {
    timeZone: data.time_zone,
    checkInRotationSeconds: data.check_in_rotation_seconds,
    checkInGraceSeconds: data.check_in_grace_seconds,
    maxCoPresenters: data.max_co_presenters,
    companyMetric: data.company_metric,
    priorityRsvpHours: data.priority_rsvp_hours,
    limitDocumentMb: data.limit_document_mb,
    limitAudioMb: data.limit_audio_mb,
    limitImageMb: data.limit_image_mb,
    limitPosterMb: data.limit_poster_mb,
    allowJpegExport: data.allow_jpeg_export,
    emailFromName: data.email_from_name,
    emailReplyTo: data.email_reply_to,
    ratingMinAggregate: data.rating_min_aggregate,
  };
}

export const orgSettingsInput = z
  .object({
    timeZone: z.string().trim().min(1).max(64),
    checkInRotationSeconds: z.int().min(60).max(3600),
    checkInGraceSeconds: z.int().min(0).max(600),
    maxCoPresenters: z.int().min(0).max(10),
    companyMetric: z.enum(["total_points", "points_per_active_member"]),
    priorityRsvpHours: z.int().min(0).max(168),
    limitDocumentMb: z.int().min(1).max(500),
    limitAudioMb: z.int().min(1).max(2000),
    limitImageMb: z.int().min(1).max(100),
    limitPosterMb: z.int().min(1).max(200),
    allowJpegExport: z.boolean(),
    emailFromName: z.string().trim().max(120).nullable(),
    emailReplyTo: z.email().nullable(),
    ratingMinAggregate: z.int().min(1).max(20),
  })
  .strict();
export type OrgSettingsInput = z.infer<typeof orgSettingsInput>;

export async function updateOrgSettings(locale: string, input: OrgSettingsInput): Promise<{ error: string | null }> {
  const client = await requireAdmin(locale);
  if (!client) return { error: "not_authorized" };
  const { session, supabase } = client;

  const { error } = await supabase
    .from("org_settings")
    .update({
      time_zone: input.timeZone,
      check_in_rotation_seconds: input.checkInRotationSeconds,
      check_in_grace_seconds: input.checkInGraceSeconds,
      max_co_presenters: input.maxCoPresenters,
      company_metric: input.companyMetric,
      priority_rsvp_hours: input.priorityRsvpHours,
      limit_document_mb: input.limitDocumentMb,
      limit_audio_mb: input.limitAudioMb,
      limit_image_mb: input.limitImageMb,
      limit_poster_mb: input.limitPosterMb,
      allow_jpeg_export: input.allowJpegExport,
      email_from_name: input.emailFromName,
      email_reply_to: input.emailReplyTo,
      rating_min_aggregate: input.ratingMinAggregate,
    })
    .eq("org_id", session.orgId);
  if (error) throw new Error(`org_settings: ${error.message}`);
  return { error: null };
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
