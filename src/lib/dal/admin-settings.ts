import "server-only";
import { z } from "zod";
import type { NumeralSystem } from "@/components/sessions/numerals";
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
  numerals: NumeralSystem;
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
      "time_zone, numerals, check_in_rotation_seconds, check_in_grace_seconds, max_co_presenters, company_metric, priority_rsvp_hours, limit_document_mb, limit_audio_mb, limit_image_mb, limit_poster_mb, allow_jpeg_export, email_from_name, email_reply_to, rating_min_aggregate",
    )
    .eq("org_id", session.orgId)
    .maybeSingle();
  if (error) throw new Error(`org_settings: ${error.message}`);
  if (!data) return null;

  return {
    timeZone: data.time_zone,
    numerals: data.numerals as NumeralSystem,
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
    numerals: z.enum(["western", "arabic_indic"]),
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
      numerals: input.numerals,
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
