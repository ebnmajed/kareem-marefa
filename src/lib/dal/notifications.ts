import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import type { NumeralSystem } from "@/components/sessions/numerals";

// Notifications — the inbox and the preference matrix of SCR-026
// (REQ-NTF-001, REQ-NTF-003, REQ-NTF-006), plus the unread count the shell's
// bell reads.
//
// Everything WRITTEN here is the member's own: a `read_at`, or one preference
// row. Nothing in the app sends a notification — `public.notify()` does, from
// SQL, and it is revoked from `authenticated` precisely so this module cannot
// (docs/plan/notes/notify.md §0).
//
// The matrix is read from the database (`public.notification_matrix()`), never
// duplicated here. A second copy in TypeScript is a second thing to keep in
// step with `08` §1, and the one that drifts is always the copy the screen
// renders.

export type NotifyChannel = "in_app" | "email";

export const CATEGORIES = [
  "new_sessions",
  "my_sessions",
  "reminders",
  "ratings",
  "social",
  "recognition",
  "certificates",
  "moderation",
  "proposals",
  "admin_queue",
  "account",
] as const;
export type NotificationCategory = (typeof CATEGORIES)[number];

/** `08` §2's three "not switchable" categories. Every message in them is in
 *  `08` §1.7's non-optional set, and the table's check constraint refuses to
 *  store a disabled row — so the screen renders them fixed and is telling the
 *  truth rather than showing a toggle that does nothing. */
export const NOT_SWITCHABLE: ReadonlySet<string> = new Set(["certificates", "moderation", "account"]);

/** `08` §2: admins and moderators only. A member has no queue to work. */
const STAFF_ONLY: ReadonlySet<string> = new Set(["admin_queue"]);

export interface MatrixRow {
  key: string;
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  optional: boolean;
}

/** `08` §1, as the database holds it. */
export async function getNotificationMatrix(locale: string): Promise<MatrixRow[]> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("notification_matrix");
  if (error) throw new Error(`notification_matrix: ${error.message}`);
  return ((data ?? []) as Array<{ key: string; category: string; in_app: boolean; email: boolean; optional: boolean }>).map((r) => ({
    key: r.key,
    category: r.category as NotificationCategory,
    inApp: r.in_app,
    email: r.email,
    optional: r.optional,
  }));
}

export interface CategoryPreference {
  category: NotificationCategory;
  /** False for `08` §2's three fixed categories. */
  switchable: boolean;
  /** Whether any message in the category uses that channel at all — a channel
   *  no message uses renders as "not sent here", not as an off switch. */
  available: { inApp: boolean; email: boolean };
  enabled: { inApp: boolean; email: boolean };
  /** The `MSG-*` keys in this category that ignore the preference on both
   *  channels (`08` §1.7). A switchable category can still contain them —
   *  turning `my_sessions` off does not stop a cancellation — and saying so is
   *  the difference between a setting and a surprise. */
  alwaysOn: string[];
}

export interface PreferenceMatrix {
  rows: CategoryPreference[];
  /** The org's display settings, carried here so SCR-026 fetches once. The
   *  spelling is `public.numeral_system`'s own, so there is no second place
   *  for the database and the formatter to disagree. */
  numerals: NumeralSystem;
  timeZone: string;
}

/**
 * SCR-026's preference half. One row per category the viewer can have,
 * ordered as `08` §2 lists them, with the current setting per channel.
 *
 * **Absence means on.** A member who has never opened this screen has no rows
 * in `notification_preferences` and receives everything; `public.notify()`
 * reads the same default, so the screen and the send path cannot disagree.
 */
export async function getPreferenceMatrix(locale: string): Promise<PreferenceMatrix> {
  const { session, supabase } = await sessionClient(locale);
  const isStaff = session.role === "admin" || session.role === "moderator";

  const [matrix, { data: stored, error }, { data: settings }] = await Promise.all([
    getNotificationMatrix(locale),
    supabase.from("notification_preferences").select("category, channel, enabled").eq("member_id", session.memberId),
    supabase.from("org_settings").select("numerals, time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (error) throw new Error(`notification_preferences: ${error.message}`);

  const setting = new Map(((stored ?? []) as Array<{ category: string; channel: NotifyChannel; enabled: boolean }>).map((r) => [`${r.category}:${r.channel}`, r.enabled]));
  const on = (category: string, channel: NotifyChannel) => setting.get(`${category}:${channel}`) ?? true;

  const rows = CATEGORIES.filter((category) => isStaff || !STAFF_ONLY.has(category)).map((category) => {
    const messages = matrix.filter((m) => m.category === category);
    const switchable = !NOT_SWITCHABLE.has(category);
    return {
      category,
      switchable,
      available: { inApp: messages.some((m) => m.inApp), email: messages.some((m) => m.email) },
      enabled: {
        inApp: switchable ? on(category, "in_app") : true,
        email: switchable ? on(category, "email") : true,
      },
      alwaysOn: messages.filter((m) => !m.optional).map((m) => m.key),
    };
  });

  return {
    rows,
    numerals: settings?.numerals ?? "western",
    timeZone: settings?.time_zone ?? "Asia/Riyadh",
  };
}

export const preferenceInput = z.object({
  category: z.enum(CATEGORIES),
  channel: z.enum(["in_app", "email"]),
  enabled: z.boolean(),
});
export type PreferenceInput = z.infer<typeof preferenceInput>;

/**
 * Set one preference. Update-then-insert rather than an upsert: the member's
 * grant on this table covers `enabled` and nothing else, so the `on conflict
 * do update set …` a client-side upsert generates would touch columns the
 * grant refuses and fail with 42501 on the second save of the same row.
 */
export async function setPreference(locale: string, input: PreferenceInput): Promise<void> {
  if (NOT_SWITCHABLE.has(input.category) && !input.enabled) throw new Error("not_switchable");
  const { session, supabase } = await sessionClient(locale);

  const { data: updated, error: updateError } = await supabase
    .from("notification_preferences")
    .update({ enabled: input.enabled })
    .eq("member_id", session.memberId)
    .eq("category", input.category)
    .eq("channel", input.channel)
    .select("id");
  if (updateError) throw mapError(updateError);
  if (updated && updated.length > 0) return;

  const { error: insertError } = await supabase.from("notification_preferences").insert({
    org_id: session.orgId,
    member_id: session.memberId,
    category: input.category,
    channel: input.channel,
    enabled: input.enabled,
  });
  // Two tabs, one member: the row appeared between the update and the insert.
  // The update above is the retry, and it is idempotent.
  if (insertError?.code === "23505") {
    const { error: retryError } = await supabase
      .from("notification_preferences")
      .update({ enabled: input.enabled })
      .eq("member_id", session.memberId)
      .eq("category", input.category)
      .eq("channel", input.channel);
    if (retryError) throw mapError(retryError);
    return;
  }
  if (insertError) throw mapError(insertError);
}

function mapError(error: { code?: string; message: string }): Error {
  if (error.code === "23514") return new Error("not_switchable");
  if (error.code === "42501") return new Error("not_permitted");
  return new Error(`notification_preferences: ${error.message}`);
}

export interface NotificationDTO {
  id: string;
  key: string;
  payload: Record<string, unknown>;
  sessionId: string | null;
  readAt: string | null;
  createdAt: string;
}

type NotificationRow = {
  id: string;
  key: string;
  payload: Record<string, unknown> | null;
  session_id: string | null;
  read_at: string | null;
  created_at: string;
};

const toDTO = (r: NotificationRow): NotificationDTO => ({
  id: r.id,
  key: r.key,
  payload: r.payload ?? {},
  sessionId: r.session_id,
  readAt: r.read_at,
  createdAt: r.created_at,
});

/**
 * The inbox (`REQ-NTF-006`), newest first. `p7_self_read` is the boundary; the
 * `member_id` filter here is defence in depth, and the ordering matches the
 * `(org_id, member_id, read_at nulls first, created_at desc)` index `02` §4.14
 * names.
 */
export async function listNotifications(locale: string, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<NotificationDTO[]> {
  const { session, supabase } = await sessionClient(locale);
  let query = supabase
    .from("notifications")
    .select("id, key, payload, session_id, read_at, created_at")
    .eq("member_id", session.memberId)
    .order("created_at", { ascending: false })
    .limit(Math.min(opts.limit ?? 50, 200));
  if (opts.unreadOnly) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) throw new Error(`notifications: ${error.message}`);
  return ((data ?? []) as NotificationRow[]).map(toDTO);
}

/** `REQ-NTF-006`: "unread count is accurate across devices" — so it is counted
 *  at the database on every read, never cached in a cookie or a client store. */
export async function getUnreadCount(locale: string): Promise<number> {
  const { session, supabase } = await sessionClient(locale);
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("member_id", session.memberId)
    .is("read_at", null);
  if (error) throw new Error(`notifications: ${error.message}`);
  return count ?? 0;
}

/** Marking read is idempotent and never un-reads: a second device that opens
 *  the same notification must not move the timestamp. */
export async function markRead(locale: string, notificationId: string): Promise<void> {
  if (!z.uuid().safeParse(notificationId).success) throw new Error("not_found");
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("member_id", session.memberId)
    .is("read_at", null);
  if (error) throw new Error(`notifications: ${error.message}`);
}

export async function markAllRead(locale: string): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("member_id", session.memberId)
    .is("read_at", null);
  if (error) throw new Error(`notifications: ${error.message}`);
}

// ── The admin surfaces of SCR-058 and the reminder schedule ─────────────────
//
// `notify` holds `app/admin/{emails,reminders}` for wave 2 and hands them to
// `console` at wave 3, the same carve-out DEC-042 made for `sessions`.
//
// Each of these returns `null` for a caller who is not an org admin, and the
// page calls `notFound()` — the same shape as `listVenuesForAdmin`. RLS is
// still the boundary (`templates_read_admin`, `deliveries_read_admin`); this
// is so the screen 404s instead of rendering an empty table that looks like
// an org with no templates.

export interface TemplateDTO {
  id: string;
  key: string;
  channel: NotifyChannel;
  locale: string;
  subject: string | null;
  body: string;
  requiredFields: string[];
  updatedAt: string;
}

export interface TemplateCatalogue {
  templates: TemplateDTO[];
  /** Every `MSG-*` with an email channel, so the screen can offer the ones
   *  the org has not overridden rather than only listing what exists. */
  emailMessages: string[];
}

async function assertAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

export async function getTemplateCatalogue(locale: string): Promise<TemplateCatalogue | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const [{ data, error }, matrix] = await Promise.all([
    supabase
      .from("notification_templates")
      .select("id, key, channel, locale, subject, body, required_fields, updated_at")
      .eq("org_id", session.orgId)
      .order("key"),
    getNotificationMatrix(locale),
  ]);
  if (error) throw new Error(`notification_templates: ${error.message}`);

  return {
    templates: ((data ?? []) as Array<{
      id: string;
      key: string;
      channel: NotifyChannel;
      locale: string;
      subject: string | null;
      body: string;
      required_fields: string[] | null;
      updated_at: string;
    }>).map((r) => ({
      id: r.id,
      key: r.key,
      channel: r.channel,
      locale: r.locale,
      subject: r.subject,
      body: r.body,
      requiredFields: r.required_fields ?? [],
      updatedAt: r.updated_at,
    })),
    emailMessages: matrix.filter((m) => m.email).map((m) => m.key),
  };
}

export const templateInput = z.object({
  key: z.string().min(3).max(80),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  requiredFields: z.array(z.string().trim().min(1).max(80)).max(20),
});
export type TemplateInput = z.infer<typeof templateInput>;

/**
 * `REQ-NTF-007`. The validation that matters is NOT here: the
 * `notification_templates_validate` trigger (migration 0026) refuses a body
 * that omits a declared `required_fields` entry, and refuses a key or channel
 * `08` §1 does not list. This maps those refusals to something the screen can
 * say, rather than re-implementing them where they could drift.
 */
export async function saveTemplate(locale: string, input: TemplateInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_permitted");
  const { session, supabase } = client;

  const row = {
    org_id: session.orgId,
    key: input.key,
    channel: "email" as const,
    locale: "ar",
    subject: input.subject,
    body: input.body,
    required_fields: input.requiredFields,
  };

  const { data: existing, error: findError } = await supabase
    .from("notification_templates")
    .select("id")
    .eq("org_id", session.orgId)
    .eq("key", input.key)
    .eq("channel", "email")
    .eq("locale", "ar")
    .maybeSingle();
  if (findError) throw new Error(`notification_templates: ${findError.message}`);

  const { error } = existing
    ? await supabase.from("notification_templates").update(row).eq("id", existing.id)
    : await supabase.from("notification_templates").insert(row);
  if (error) throw mapTemplateError(error);
}

export async function deleteTemplate(locale: string, id: string): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_permitted");
  if (!z.uuid().safeParse(id).success) throw new Error("not_found");
  const { error } = await client.supabase.from("notification_templates").delete().eq("id", id);
  if (error) throw new Error(`notification_templates: ${error.message}`);
}

function mapTemplateError(error: { code?: string; message: string }): Error {
  // The trigger's own errcodes (0026): 23514 a missing required field,
  // 22023 a key or channel outside 08 §1.
  if (error.code === "23514") return new Error("missing_required_field");
  if (error.code === "22023") return new Error("unknown_message_key");
  if (error.code === "42501") return new Error("not_permitted");
  return new Error(`notification_templates: ${error.message}`);
}

export interface DeliveryDTO {
  id: string;
  key: string;
  status: "queued" | "sent" | "delivered" | "bounced" | "failed";
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  member: { id: string; displayName: string | null } | null;
}

/** `REQ-NTF-008` — "A bounce or failure is visible to the org admin, with the
 *  reason." Failures first, because that is what the screen exists for. */
export async function listDeliveries(locale: string, opts: { limit?: number } = {}): Promise<DeliveryDTO[] | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const { data, error } = await supabase
    .from("email_deliveries")
    .select("id, key, status, error, created_at, sent_at, member_id")
    .eq("org_id", session.orgId)
    .order("created_at", { ascending: false })
    .limit(Math.min(opts.limit ?? 100, 500));
  if (error) throw new Error(`email_deliveries: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    key: string;
    status: DeliveryDTO["status"];
    error: string | null;
    created_at: string;
    sent_at: string | null;
    member_id: string;
  }>;
  if (rows.length === 0) return [];

  // The column grant on `members` exposes exactly `display_name`/`avatar_url`
  // (0004), so this cannot leak an address even by accident — which matters
  // on a screen about email.
  const ids = Array.from(new Set(rows.map((r) => r.member_id)));
  const { data: members, error: memberError } = await supabase.from("members_member_view").select("id, display_name").in("id", ids);
  if (memberError) throw new Error(`members_member_view: ${memberError.message}`);
  const byId = new Map((members ?? []).map((m) => [m.id as string, m.display_name as string | null]));

  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    status: r.status,
    error: r.error,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    member: byId.has(r.member_id) ? { id: r.member_id, displayName: byId.get(r.member_id) ?? null } : null,
  }));
}

export interface ReminderSchedule {
  offsetsMinutes: number[];
  ratingPromptDelayMinutes: number;
  /** REQ-INT-006: the screen prints these numbers, so it needs the org's
   *  system. Without it the hint under the input rendered «١٠٠٨٠» while the
   *  input itself held «10080» — two numeral systems, one screen. */
  numerals: NumeralSystem;
}

export async function getReminderSchedule(locale: string): Promise<ReminderSchedule | null> {
  const client = await assertAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;
  const { data, error } = await supabase
    .from("org_settings")
    .select("reminder_offsets_minutes, rating_prompt_delay_minutes, numerals")
    .eq("org_id", session.orgId)
    .maybeSingle();
  if (error) throw new Error(`org_settings: ${error.message}`);
  return {
    offsetsMinutes: data?.reminder_offsets_minutes ?? [10080, 1440, 120],
    ratingPromptDelayMinutes: data?.rating_prompt_delay_minutes ?? 60,
    numerals: data?.numerals === "arabic_indic" ? "arabic_indic" : "western",
  };
}

export const reminderScheduleInput = z.object({
  // A19's defaults are 7 d / 1 d / 2 h; the bounds keep an admin from
  // scheduling a reminder a year out or one minute before, either of which is
  // a job the queue will hold pointlessly.
  offsetsMinutes: z.array(z.number().int().min(5).max(43200)).min(1).max(6),
  ratingPromptDelayMinutes: z.number().int().min(0).max(10080),
});
export type ReminderScheduleInput = z.infer<typeof reminderScheduleInput>;

/**
 * `REQ-NTF-004` / `REQ-ADM-016`. The rescheduling is NOT here: the
 * `org_settings_reschedule` trigger (supabase/proposed/notify/0008) removes
 * every pending job under an abandoned offset and re-walks the new set for
 * every published session in the org. Doing it in this function would leave
 * the same orphans behind whenever the value changed by any other path.
 */
export async function setReminderSchedule(locale: string, input: ReminderScheduleInput): Promise<void> {
  const client = await assertAdmin(locale);
  if (!client) throw new Error("not_permitted");
  const { session, supabase } = client;

  const offsets = Array.from(new Set(input.offsetsMinutes)).sort((a, b) => b - a);
  const { error } = await supabase
    .from("org_settings")
    .update({ reminder_offsets_minutes: offsets, rating_prompt_delay_minutes: input.ratingPromptDelayMinutes })
    .eq("org_id", session.orgId);
  if (error) throw new Error(error.code === "42501" ? "not_permitted" : `org_settings: ${error.message}`);
}
