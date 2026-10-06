import "server-only";
import { z } from "zod";
import { readAll } from "@/lib/dal/admin-paging";
import { sessionClient } from "@/lib/dal/session";
import { ANNOUNCEMENT_MAX, announcementStatus, sameMinute, type AnnouncementStatus } from "@/components/announcements/rules";

// An org's announcements, as the console writes them — REQ-ADM-025, DEC-267, 0164 + 0213.
//
// «إعلان» is NOT a session: a short text an admin publishes to the whole org, now or at a time, with an optional end.
// It shows in every member's home feed (`feed.ts` reads it through 0164's member policy) and, when it goes live, the
// worker's `publish_announcement` job notifies every active member ONCE (`announced_at`, written by the database
// alone). Editing after that never re-sends.
//
// ★ RLS IS THE BOUNDARY. Admins read every row of their org (`feed_announcements_admin_read`), insert as themselves
// (`author_id = auth_member_id()`), update the body and the two instants (0213's column grant) and delete. The role
// check here is defence in depth and the page's not-found; a moderator or member reaches nothing. No `service_role`.
//
// Every write answers with what it WROTE — a row RLS filtered away is `{ ok: false }`, never a success.

export interface AdminAnnouncement {
  id: string;
  body: string;
  publishedAt: string;
  expiresAt: string | null;
  /** When members were notified, or null — written by `publish_announcement()` only. */
  announcedAt: string | null;
  /** Derived from the two instants, as 0164's read policy draws the line. */
  status: AnnouncementStatus;
  announced: boolean;
}

export interface AdminAnnouncements {
  rows: AdminAnnouncement[];
  /** The org's zone — the form's wall clock and every printed instant. */
  timeZone: string;
}

export type AnnouncementWrite = { ok: boolean };

const instant = z.iso.datetime({ offset: true });

/** Shape, not authority (CLAUDE.md «Validation»): the author and the org are the session's, never the form's. A null
 *  `publishAt` is «now». The relations between the instants are the action's to say at the field and the database's
 *  check to enforce (`expires_at > published_at`, 0164). */
export const announcementInput = z
  .object({
    body: z.string().trim().min(1).max(ANNOUNCEMENT_MAX),
    publishAt: instant.nullable(),
    expiresAt: instant.nullable(),
  })
  .strict();
export type AnnouncementInput = z.infer<typeof announcementInput>;

async function requireAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

type Row = { id: string; body: string; published_at: string; expires_at: string | null; announced_at: string | null };

function toDto(row: Row, now: Date): AdminAnnouncement {
  const dto = { publishedAt: row.published_at, expiresAt: row.expires_at };
  return {
    id: row.id,
    body: row.body,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    announcedAt: row.announced_at,
    status: announcementStatus(dto, now),
    announced: row.announced_at !== null,
  };
}

/** Every announcement of the org, newest first — scheduled and ended included. `null` for anyone not an admin. */
export async function listAnnouncementsForAdmin(locale: string, now: Date = new Date()): Promise<AdminAnnouncements | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;
  const [rows, settings] = await Promise.all([
    readAll("feed_announcements", (from, to) =>
      supabase
        .from("feed_announcements")
        .select("id, body, published_at, expires_at, announced_at")
        .eq("org_id", session.orgId)
        .order("published_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  return {
    rows: (rows as Row[]).map((r) => toDto(r, now)),
    timeZone: (settings.data?.time_zone as string | undefined) ?? "Asia/Riyadh",
  };
}

/** The org's zone, for an action that reads the form's wall clock. */
export async function announcementTimeZone(locale: string): Promise<string> {
  const { session, supabase } = await sessionClient(locale);
  const { data } = await supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle();
  return (data?.time_zone as string | undefined) ?? "Asia/Riyadh";
}

const wrote = (result: { data: unknown[] | null; error: unknown }): AnnouncementWrite => ({ ok: !result.error && (result.data ?? []).length === 1 });

/** Publish now (`publishAt` null — the column's `now()`) or at a time. The database queues the notification. */
export async function createAnnouncement(locale: string, input: AnnouncementInput): Promise<AnnouncementWrite> {
  const parsed = announcementInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const client = await requireAdmin(locale);
  if (!client) return { ok: false };
  const { session, supabase } = client;
  const { body, publishAt, expiresAt } = parsed.data;
  return wrote(
    await supabase
      .from("feed_announcements")
      .insert({
        org_id: session.orgId,
        author_id: session.memberId,
        body,
        ...(publishAt ? { published_at: publishAt } : {}),
        expires_at: expiresAt,
      })
      .select("id"),
  );
}

/**
 * The text and the two instants. `publishAt` null is «now». A time equal to the stored one TO THE MINUTE keeps the
 * stored instant — the picker carries no seconds, and re-saving an untouched form must not move the row or re-queue
 * its job. ★ An announcement already sent is never sent again (`announced_at`, 0213), whatever is edited.
 */
export async function updateAnnouncement(locale: string, announcementId: string, input: AnnouncementInput): Promise<AnnouncementWrite> {
  if (!z.uuid().safeParse(announcementId).success) return { ok: false };
  const parsed = announcementInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const client = await requireAdmin(locale);
  if (!client) return { ok: false };
  const { supabase } = client;

  const { data: current, error } = await supabase.from("feed_announcements").select("published_at").eq("id", announcementId).maybeSingle();
  if (error || !current) return { ok: false };
  const stored = current.published_at as string;
  const next = parsed.data.publishAt ?? new Date().toISOString();
  const publishedAt = sameMinute(next, stored) ? stored : next;

  return wrote(
    await supabase
      .from("feed_announcements")
      .update({ body: parsed.data.body, published_at: publishedAt, expires_at: parsed.data.expiresAt })
      .eq("id", announcementId)
      .select("id"),
  );
}

export async function deleteAnnouncement(locale: string, announcementId: string): Promise<AnnouncementWrite> {
  if (!z.uuid().safeParse(announcementId).success) return { ok: false };
  const client = await requireAdmin(locale);
  if (!client) return { ok: false };
  return wrote(await client.supabase.from("feed_announcements").delete().eq("id", announcementId).select("id"));
}
