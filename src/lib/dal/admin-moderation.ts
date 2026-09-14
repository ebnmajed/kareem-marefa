import "server-only";
import { z } from "zod";
import { restorePhoto } from "@/lib/dal/photos";
import { sessionClient } from "@/lib/dal/session";

// SCR-050/051/052 — moderation queues (REQ-ADM-010, REQ-EVT-008, REQ-EVT-012,
// REQ-EVT-014). Three screens, not one, because photos have TWO distinct
// moderation paths and comments have one (DEC-005/OQ-008):
//
//   SCR-050 /moderation/comments — open REPORTS on comments. A comment has
//     no "instant hide" concept, so the report queue is its only path.
//   SCR-051 /moderation/photos   — open TAKEDOWN requests: already hidden,
//     awaiting review (DEC-005's own wording, REQ-EVT-012).
//   SCR-052 /moderation/reports  — open REPORTS on photos: NOT yet hidden,
//     still publicly visible, a different urgency than SCR-051 by design.
//     The two are never merged in one queue (DEC-005: "the UI must not
//     merge them; they call for opposite senses of urgency").
//
// Writes reuse what already exists wherever it does: `moderateComment()`
// (event's comments.ts) for a plain remove/restore with no reason,
// `restorePhoto()` (content's photos.ts) for clearing a takedown. Removal
// WITH a reason (REQ-EVT-014) and photo removal at all
// (`remove_photo()`, supabase/proposed/console/0003_moderation.sql) are
// this track's own, since neither existed before this bundle.

async function requireStaff(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" || client.session.role === "moderator" ? client : null;
}

async function namesFor(supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"], ids: string[]): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("members").select("id, display_name").in("id", unique);
  if (error) throw new Error(`members: ${error.message}`);
  return new Map((data ?? []).map((m) => [m.id as string, m.display_name as string | null]));
}

async function titlesFor(supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"], ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("sessions").select("id, title").in("id", unique);
  if (error) throw new Error(`sessions: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.id as string, s.title as string]));
}

// ── SCR-050 — comment reports ────────────────────────────────────────────

export interface CommentReportRow {
  reportId: string;
  commentId: string;
  commentBody: string;
  commentDeleted: boolean;
  commentAuthorName: string | null;
  sessionId: string;
  sessionTitle: string;
  reporterName: string | null;
  reason: string;
  createdAt: string;
}

export async function listCommentReports(locale: string): Promise<CommentReportRow[] | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const { supabase } = client;

  const { data: reports, error } = await supabase
    .from("reports")
    .select("id, comment_id, reporter_id, reason, created_at")
    .eq("target", "comment")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`reports: ${error.message}`);
  const rows = reports ?? [];
  if (rows.length === 0) return [];

  const commentIds = rows.map((r) => r.comment_id as string);
  const { data: comments, error: cErr } = await supabase.from("comments").select("id, body, session_id, author_id, deleted_at").in("id", commentIds);
  if (cErr) throw new Error(`comments: ${cErr.message}`);
  const commentById = new Map((comments ?? []).map((c) => [c.id as string, c]));

  const [names, titles] = await Promise.all([
    namesFor(
      supabase,
      rows.flatMap((r) => [r.reporter_id as string, commentById.get(r.comment_id as string)?.author_id as string]),
    ),
    titlesFor(
      supabase,
      (comments ?? []).map((c) => c.session_id as string),
    ),
  ]);

  return rows
    .map((r) => {
      const c = commentById.get(r.comment_id as string);
      if (!c) return null;
      return {
        reportId: r.id as string,
        commentId: c.id as string,
        commentBody: c.body as string,
        commentDeleted: c.deleted_at !== null,
        commentAuthorName: names.get(c.author_id as string) ?? null,
        sessionId: c.session_id as string,
        sessionTitle: titles.get(c.session_id as string) ?? "",
        reporterName: names.get(r.reporter_id as string) ?? null,
        reason: r.reason as string,
        createdAt: r.created_at as string,
      };
    })
    .filter((r): r is CommentReportRow => r !== null);
}

const resolveCommentReportInput = z.object({ reportId: z.uuid(), action: z.enum(["remove", "dismiss"]), reason: z.string().trim().max(300).optional() });
export type ResolveCommentReportInput = z.infer<typeof resolveCommentReportInput>;

/** `REQ-EVT-014`'s reason, on top of `p6_staff_update`'s existing column
 *  grant (extended by `0003_moderation.sql` to include `removal_reason`) —
 *  a plain UPDATE, not `moderateComment()` (event's, no reason parameter),
 *  so the reason this track collects is not silently dropped. */
export async function resolveCommentReport(locale: string, input: ResolveCommentReportInput): Promise<{ error: string | null }> {
  const parsed = resolveCommentReportInput.parse(input);
  const client = await requireStaff(locale);
  if (!client) return { error: "not_authorized" };
  const { session, supabase } = client;

  const { data: report, error: rErr } = await supabase.from("reports").select("id, comment_id, status").eq("id", parsed.reportId).maybeSingle();
  if (rErr) throw new Error(`reports: ${rErr.message}`);
  if (!report) return { error: "not_found" };
  if (report.status !== "open") return { error: null }; // already resolved — a harmless no-op

  if (parsed.action === "remove") {
    if (!parsed.reason || parsed.reason.length < 3) return { error: "reason_required" };
    const { error } = await supabase.from("comments").update({ deleted_at: new Date().toISOString(), removal_reason: parsed.reason }).eq("id", report.comment_id);
    if (error) throw new Error(`comments: ${error.message}`);
  }

  const { error: resolveErr } = await supabase
    .from("reports")
    .update({ status: "resolved", resolution: parsed.action === "remove" ? "removed" : "dismissed", resolved_by: session.memberId, resolved_at: new Date().toISOString() })
    .eq("id", parsed.reportId);
  if (resolveErr) throw new Error(`reports: ${resolveErr.message}`);
  return { error: null };
}

// ── SCR-051 — photo takedowns (already hidden) ───────────────────────────

export interface PhotoTakedownRow {
  takedownId: string;
  photoId: string;
  photoUrl: string;
  uploaderName: string | null;
  requesterName: string | null;
  sessionId: string;
  sessionTitle: string;
  requestedAt: string;
}

export async function listPhotoTakedowns(locale: string): Promise<PhotoTakedownRow[] | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const { supabase } = client;

  const { data: takedowns, error } = await supabase
    .from("photo_takedowns")
    .select("id, photo_id, requester_id, requested_at")
    .is("resolved_at", null)
    .order("requested_at", { ascending: true });
  if (error) throw new Error(`photo_takedowns: ${error.message}`);
  const rows = takedowns ?? [];
  if (rows.length === 0) return [];

  const photoIds = rows.map((r) => r.photo_id as string);
  const { data: photos, error: pErr } = await supabase.from("photos").select("id, storage_path, uploader_id, session_id").in("id", photoIds);
  if (pErr) throw new Error(`photos: ${pErr.message}`);
  const photoById = new Map((photos ?? []).map((p) => [p.id as string, p]));

  const [names, titles, urls] = await Promise.all([
    namesFor(
      supabase,
      rows.flatMap((r) => [r.requester_id as string, photoById.get(r.photo_id as string)?.uploader_id as string]),
    ),
    titlesFor(
      supabase,
      (photos ?? []).map((p) => p.session_id as string),
    ),
    signedUrls(
      supabase,
      (photos ?? []).map((p) => p.storage_path as string),
    ),
  ]);

  return rows
    .map((r) => {
      const p = photoById.get(r.photo_id as string);
      if (!p) return null;
      return {
        takedownId: r.id as string,
        photoId: p.id as string,
        photoUrl: urls.get(p.storage_path as string) ?? "",
        uploaderName: names.get(p.uploader_id as string) ?? null,
        requesterName: names.get(r.requester_id as string) ?? null,
        sessionId: p.session_id as string,
        sessionTitle: titles.get(p.session_id as string) ?? "",
        requestedAt: r.requested_at as string,
      };
    })
    .filter((r): r is PhotoTakedownRow => r !== null);
}

async function signedUrls(supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"], paths: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const entries = await Promise.all(
    unique.map(async (path) => {
      const { data } = await supabase.storage.from("photos").createSignedUrl(path, 3600);
      return [path, data?.signedUrl ?? ""] as const;
    }),
  );
  return new Map(entries);
}

const resolveTakedownInput = z.object({ takedownId: z.uuid(), photoId: z.uuid(), action: z.enum(["restore", "remove"]), reason: z.string().trim().max(300).optional() });
export type ResolveTakedownInput = z.infer<typeof resolveTakedownInput>;

/** `restore` reuses `restorePhoto()` (content's, already resolves this
 *  exact takedown row itself). `remove` calls `remove_photo()`
 *  (`0003_moderation.sql`), which also resolves the takedown and any open
 *  report on the same photo in one transaction. */
export async function resolvePhotoTakedown(locale: string, input: ResolveTakedownInput): Promise<{ error: string | null }> {
  const parsed = resolveTakedownInput.parse(input);
  const client = await requireStaff(locale);
  if (!client) return { error: "not_authorized" };
  const { supabase } = client;

  if (parsed.action === "restore") {
    const ok = await restorePhoto(locale, parsed.photoId);
    return { error: ok ? null : "not_found" };
  }

  if (!parsed.reason || parsed.reason.length < 3) return { error: "reason_required" };
  const { error } = await supabase.rpc("remove_photo", { p_photo: parsed.photoId, p_reason: parsed.reason });
  if (error) return { error: /not_authorized|reason_required|not_found/.exec(error.message)?.[0] ?? "unknown" };
  return { error: null };
}

// ── SCR-052 — photo reports (not yet hidden) ─────────────────────────────

export interface PhotoReportRow {
  reportId: string;
  photoId: string;
  photoUrl: string;
  uploaderName: string | null;
  reporterName: string | null;
  sessionId: string;
  sessionTitle: string;
  reason: string;
  createdAt: string;
}

export async function listPhotoReports(locale: string): Promise<PhotoReportRow[] | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const { supabase } = client;

  const { data: reports, error } = await supabase
    .from("reports")
    .select("id, photo_id, reporter_id, reason, created_at")
    .eq("target", "photo")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`reports: ${error.message}`);
  const rows = reports ?? [];
  if (rows.length === 0) return [];

  const photoIds = rows.map((r) => r.photo_id as string);
  const { data: photos, error: pErr } = await supabase.from("photos").select("id, storage_path, uploader_id, session_id").in("id", photoIds);
  if (pErr) throw new Error(`photos: ${pErr.message}`);
  const photoById = new Map((photos ?? []).map((p) => [p.id as string, p]));

  const [names, titles, urls] = await Promise.all([
    namesFor(
      supabase,
      rows.flatMap((r) => [r.reporter_id as string, photoById.get(r.photo_id as string)?.uploader_id as string]),
    ),
    titlesFor(
      supabase,
      (photos ?? []).map((p) => p.session_id as string),
    ),
    signedUrls(
      supabase,
      (photos ?? []).map((p) => p.storage_path as string),
    ),
  ]);

  return rows
    .map((r) => {
      const p = photoById.get(r.photo_id as string);
      if (!p) return null;
      return {
        reportId: r.id as string,
        photoId: p.id as string,
        photoUrl: urls.get(p.storage_path as string) ?? "",
        uploaderName: names.get(p.uploader_id as string) ?? null,
        reporterName: names.get(r.reporter_id as string) ?? null,
        sessionId: p.session_id as string,
        sessionTitle: titles.get(p.session_id as string) ?? "",
        reason: r.reason as string,
        createdAt: r.created_at as string,
      };
    })
    .filter((r): r is PhotoReportRow => r !== null);
}

const resolvePhotoReportInput = z.object({ reportId: z.uuid(), photoId: z.uuid(), action: z.enum(["remove", "dismiss"]), reason: z.string().trim().max(300).optional() });
export type ResolvePhotoReportInput = z.infer<typeof resolvePhotoReportInput>;

/** `remove` calls `remove_photo()`, which resolves THIS report row itself
 *  (it matches on `target = 'photo' and photo_id = … and status = 'open'`)
 *  — no separate reports write needed on that path. `dismiss` is a plain
 *  `p6_staff_update`. */
export async function resolvePhotoReport(locale: string, input: ResolvePhotoReportInput): Promise<{ error: string | null }> {
  const parsed = resolvePhotoReportInput.parse(input);
  const client = await requireStaff(locale);
  if (!client) return { error: "not_authorized" };
  const { session, supabase } = client;

  if (parsed.action === "remove") {
    if (!parsed.reason || parsed.reason.length < 3) return { error: "reason_required" };
    const { error } = await supabase.rpc("remove_photo", { p_photo: parsed.photoId, p_reason: parsed.reason });
    if (error) return { error: /not_authorized|reason_required|not_found/.exec(error.message)?.[0] ?? "unknown" };
    return { error: null };
  }

  const { error } = await supabase
    .from("reports")
    .update({ status: "resolved", resolution: "dismissed", resolved_by: session.memberId, resolved_at: new Date().toISOString() })
    .eq("id", parsed.reportId);
  if (error) throw new Error(`reports: ${error.message}`);
  return { error: null };
}
