import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

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
  /** The org's display settings, carried here so SCR-026 fetches once.
   *  `public.numeral_system` spells the second value `arabic_indic`; the
   *  shared `NumeralSystem` of components/sessions/numerals.ts spells it
   *  `arabic`, so the mapping happens here, once, at the boundary. */
  numerals: "western" | "arabic";
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
    numerals: settings?.numerals === "arabic_indic" ? "arabic" : "western",
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
