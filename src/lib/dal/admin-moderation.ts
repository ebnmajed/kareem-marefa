import "server-only";
import { z } from "zod";
import { avatarHref } from "@/lib/dal/avatars";
import { sessionClient } from "@/lib/dal/session";

// SCR-050/052 البلاغات and SCR-051 الصور — moderation, ACTIONED (REQ-ADM-010, REQ-UIX-103, REQ-UIX-104, REQ-EVT-008,
// REQ-EVT-012, REQ-EVT-014). Rebuilt in wave 22 (DEC-230 §3, DEC-231 §5, DEC-232 §5.3); the kept-behaviour tables are
// `docs/plan/notes/content.md` W22.3 – W22.4.
//
// ★ Two screens, and the queues sit where the boards put them: COMMENT reports on البلاغات, takedown requests AND
// photo reports on الصور — two chips there, never one list (DEC-005: a takedown is already hidden, a report is not).
//
// ★ ONE ROW PER REPORTED THING, not per report (DEC-232 §5.3). A decision is about the content, and the database
// closes every open report on it in the same transaction (`resolve_report()`, `remove_photo()`), so a per-report list
// would leave a sibling row behind after every decision.
//
// ★ EVERY WRITE IS ONE STATEMENT OR ONE FUNCTION, AND SAYS WHAT IT WROTE (DEC-232 §3.1). No function here writes
// `audit_log`: `report.resolved`, `comment.removed`, `photo.removed` and `photo.restored` are the database's triggers.
//
// Admin and moderator alike (REQ-ADM-020 — moderation is theirs); anyone else gets `null`, and the page answers with
// its own streamed not-found. Never a layout.

async function requireStaff(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" || client.session.role === "moderator" ? client : null;
}

type Supabase = Awaited<ReturnType<typeof sessionClient>>["supabase"];

const DAY = 86_400_000;
const ageDays = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));

/** A member as the console draws one: our copy of the picture (DEC-099), the team ring, the name. */
export interface ModerationPerson {
  memberId: string;
  name: string | null;
  avatarUrl: string | null;
  teamColor: string | null;
}

async function people(supabase: Supabase, ids: (string | null | undefined)[]): Promise<Map<string, ModerationPerson>> {
  const unique = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("members_member_view").select("id, display_name, company_id, avatar_version").in("id", unique);
  if (error) throw new Error(`members_member_view (moderation): ${error.message}`);
  const rows = (data ?? []) as { id: string; display_name: string | null; company_id: string | null; avatar_version: number | null }[];
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter((v): v is string => v !== null))];
  const colours = new Map<string, string | null>();
  if (companyIds.length > 0) {
    const { data: found, error: cErr } = await supabase.from("companies").select("id, team_color").in("id", companyIds);
    if (cErr) throw new Error(`companies (moderation): ${cErr.message}`);
    for (const c of (found ?? []) as { id: string; team_color: string | null }[]) colours.set(c.id, c.team_color ?? null);
  }
  return new Map(
    rows.map((r) => [
      r.id,
      {
        memberId: r.id,
        name: r.display_name,
        avatarUrl: avatarHref({ id: r.id, avatarVersion: r.avatar_version }, 96),
        teamColor: r.company_id ? (colours.get(r.company_id) ?? null) : null,
      },
    ]),
  );
}

function person(map: Map<string, ModerationPerson>, id: string | null | undefined): ModerationPerson | null {
  if (!id) return null;
  return map.get(id) ?? { memberId: id, name: null, avatarUrl: null, teamColor: null };
}

async function titles(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("sessions").select("id, title").in("id", unique);
  if (error) throw new Error(`sessions (moderation): ${error.message}`);
  return new Map((data ?? []).map((s) => [s.id as string, s.title as string]));
}

/** Signed for an hour — the EXIF-stripped object, the only one a row points at (REQ-EVT-011). A preview, not a download. */
async function signed(supabase: Supabase, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (path) => {
      const { data } = await supabase.storage.from("photos").createSignedUrl(path, 3600);
      return [path, data?.signedUrl ?? ""] as const;
    }),
  );
  return new Map(entries);
}

function groupBy<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

// ── SCR-050/052 — reported comments ─────────────────────────────────────────────────────────────────────────────

export type ReportState = "open" | "closed";

export interface Decision {
  outcome: "removed" | "dismissed" | "restored";
  by: ModerationPerson | null;
  ageDays: number;
}

export interface CommentReportRow {
  commentId: string;
  /** The report the decision is called with — the oldest open one (any open report closes them all). */
  reportId: string;
  body: string;
  /** Deleted already — by its author, or by staff on the event page. */
  deleted: boolean;
  author: ModerationPerson | null;
  sessionId: string;
  sessionTitle: string;
  /** Oldest first: who reported it and why (REQ-EVT-008 — visible to staff, never to the author). */
  reports: { reporter: ModerationPerson | null; reason: string }[];
  /** The oldest open report's age (open), or the decision's (closed). */
  ageDays: number;
  /** Closed rows only: the outcome and who decided (REQ-ADM-010). */
  decision: Decision | null;
}

export interface CommentReportQueue {
  rows: CommentReportRow[];
  /** Reported comments awaiting a decision — the chip's figure, and the rail's (contract 5). */
  openCount: number;
}

type ReportRow = {
  id: string;
  comment_id: string | null;
  photo_id: string | null;
  reporter_id: string;
  reason: string;
  status: string;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

const REPORT_COLUMNS = "id, comment_id, photo_id, reporter_id, reason, status, resolution, resolved_by, resolved_at, created_at";
/** The closed lists' reach: the latest decisions, never the whole history (the audit log keeps that). */
const CLOSED_LIMIT = 200;

export async function listCommentReportQueue(locale: string, state: ReportState): Promise<CommentReportQueue | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const { supabase } = client;
  const now = Date.now();

  const { data: openData, error: openErr } = await supabase
    .from("reports")
    .select(REPORT_COLUMNS)
    .eq("target", "comment")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (openErr) throw new Error(`reports (open comments): ${openErr.message}`);
  const open = (openData ?? []) as ReportRow[];
  const openByComment = groupBy(open, (r) => r.comment_id);

  let reports: ReportRow[];
  let groups: Map<string, ReportRow[]>;
  if (state === "open") {
    reports = open;
    groups = openByComment;
  } else {
    const { data, error } = await supabase
      .from("reports")
      .select(REPORT_COLUMNS)
      .eq("target", "comment")
      .neq("status", "open")
      .order("resolved_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(CLOSED_LIMIT);
    if (error) throw new Error(`reports (closed comments): ${error.message}`);
    // A comment with a report still open is undecided: it belongs to «مفتوحة», whatever was closed before.
    reports = ((data ?? []) as ReportRow[]).filter((r) => r.comment_id !== null && !openByComment.has(r.comment_id));
    groups = groupBy(reports, (r) => r.comment_id);
  }
  if (groups.size === 0) return { rows: [], openCount: openByComment.size };

  const { data: comments, error: cErr } = await supabase.from("comments").select("id, body, session_id, author_id, deleted_at").in("id", [...groups.keys()]);
  if (cErr) throw new Error(`comments (moderation): ${cErr.message}`);
  const commentById = new Map(
    ((comments ?? []) as { id: string; body: string; session_id: string; author_id: string; deleted_at: string | null }[]).map((c) => [c.id, c]),
  );

  const [members, sessionTitles] = await Promise.all([
    people(supabase, [...reports.flatMap((r) => [r.reporter_id, r.resolved_by]), ...[...commentById.values()].map((c) => c.author_id)]),
    titles(supabase, [...commentById.values()].map((c) => c.session_id)),
  ]);

  const rows: CommentReportRow[] = [];
  for (const [commentId, group] of groups) {
    const c = commentById.get(commentId);
    if (!c) continue;
    const oldestFirst = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    // Closed: the decision, read from the row that recorded it — the closed read is ordered by `resolved_at`, so the
    // group's first row is the latest decision (never «the last row» by insertion time).
    const latest = state === "closed" ? group[0] : null;
    const decidedAt = latest ? (latest.resolved_at ?? latest.created_at) : null;
    rows.push({
      commentId,
      reportId: oldestFirst[0].id,
      body: c.body,
      deleted: c.deleted_at !== null,
      author: person(members, c.author_id),
      sessionId: c.session_id,
      sessionTitle: sessionTitles.get(c.session_id) ?? "",
      reports: oldestFirst.map((r) => ({ reporter: person(members, r.reporter_id), reason: r.reason })),
      ageDays: ageDays(decidedAt ?? oldestFirst[0].created_at, now),
      decision:
        latest && decidedAt
          ? { outcome: latest.resolution === "removed" ? "removed" : "dismissed", by: person(members, latest.resolved_by), ageDays: ageDays(decidedAt, now) }
          : null,
    });
  }
  return { rows, openCount: openByComment.size };
}

// ── the decisions — through the database's functions, never two writes from here ───────────────────────────────

export type ModerationError = "not_authorized" | "reason_required" | "not_found" | "already_resolved" | "unknown";
export type ModerationResult = { done: true } | { done: false; error: ModerationError };

const decideInput = z.object({
  reportId: z.uuid(),
  outcome: z.enum(["removed", "dismissed"]),
  reason: z.string().trim().max(300).optional(),
});

function errorOf(message: string | undefined | null): ModerationError {
  const found = /not_authorized|reason_required|not_found|already_resolved/.exec(message ?? "")?.[0];
  return (found as ModerationError | undefined) ?? "unknown";
}

/** REQ-UIX-103, REQ-EVT-014 — one decision on a reported comment or photo, and every open report on it, in one
 *  transaction (`resolve_report()`, DEC-231 §4.2). `done` only when the database answers with the outcome it wrote. */
export async function decideReport(locale: string, input: z.input<typeof decideInput>): Promise<ModerationResult> {
  const parsed = decideInput.safeParse(input);
  if (!parsed.success) return { done: false, error: "unknown" };
  const client = await requireStaff(locale);
  if (!client) return { done: false, error: "not_authorized" };
  const { reportId, outcome, reason } = parsed.data;
  const { data, error } = await client.supabase.rpc("resolve_report", { p_report: reportId, p_outcome: outcome, p_reason: reason ?? null });
  if (error) return { done: false, error: errorOf(error.message) };
  const answer = (data ?? {}) as { outcome?: string };
  if (answer.outcome === outcome) return { done: true };
  return { done: false, error: errorOf(answer.outcome) };
}

// ── SCR-051 — photos awaiting a decision ────────────────────────────────────────────────────────────────────────

export type PhotoQueueKind = "takedowns" | "reports";

export interface PhotoQueueItem {
  /** The route segment. A story frame's is `frame-{frameId}` (wave 26, REQ-STO-015), so it opens the frame's detail. */
  photoId: string;
  /** Wave 26, add-only: set for a story frame — a video, or a photo frame reported as a frame. */
  frameId?: string;
  video?: boolean;
  kind: PhotoQueueKind;
  sessionTitle: string;
  thumbUrl: string;
  /** The first to ask (takedowns) or to report (reports), and how many more did. */
  first: ModerationPerson | null;
  more: number;
  ageDays: number;
}

export interface PhotoClosedItem {
  photoId: string;
  kind: PhotoQueueKind;
  sessionTitle: string;
  thumbUrl: string;
  decision: Decision;
}

export interface PhotoQueue {
  takedowns: PhotoQueueItem[];
  reports: PhotoQueueItem[];
  closed: PhotoClosedItem[];
}

type TakedownRow = { id: string; photo_id: string; requester_id: string; requested_at: string; resolved_at: string | null; resolution: string | null; resolved_by: string | null };
type PhotoRow = { id: string; storage_path: string; session_id: string; uploader_id: string; hidden_at: string | null; removed_at: string | null };
const TAKEDOWN_COLUMNS = "id, photo_id, requester_id, requested_at, resolved_at, resolution, resolved_by";

/** The queue — both chips and the closed list — in one read: the layout's, so it stays mounted beside the detail. */
export async function listPhotoQueue(locale: string): Promise<PhotoQueue | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const { supabase } = client;
  const now = Date.now();

  const [openT, openR, closedT, closedR] = await Promise.all([
    supabase.from("photo_takedowns").select(TAKEDOWN_COLUMNS).is("resolved_at", null).order("requested_at", { ascending: true }).order("id", { ascending: true }),
    supabase.from("reports").select(REPORT_COLUMNS).eq("target", "photo").eq("status", "open").order("created_at", { ascending: true }).order("id", { ascending: true }),
    supabase
      .from("photo_takedowns")
      .select(TAKEDOWN_COLUMNS)
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(CLOSED_LIMIT),
    supabase
      .from("reports")
      .select(REPORT_COLUMNS)
      .eq("target", "photo")
      .neq("status", "open")
      .order("resolved_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(CLOSED_LIMIT),
  ]);
  if (openT.error) throw new Error(`photo_takedowns (open): ${openT.error.message}`);
  if (openR.error) throw new Error(`reports (open photos): ${openR.error.message}`);
  if (closedT.error) throw new Error(`photo_takedowns (closed): ${closedT.error.message}`);
  if (closedR.error) throw new Error(`reports (closed photos): ${closedR.error.message}`);
  const takedownsOpen = (openT.data ?? []) as TakedownRow[];
  const reportsOpen = (openR.data ?? []) as ReportRow[];
  const takedownsClosed = (closedT.data ?? []) as TakedownRow[];
  const reportsClosed = (closedR.data ?? []) as ReportRow[];

  const photoIds = [
    ...new Set([...takedownsOpen, ...takedownsClosed].map((r) => r.photo_id).concat([...reportsOpen, ...reportsClosed].map((r) => r.photo_id ?? ""))),
  ].filter(Boolean);
  if (photoIds.length === 0) {
    const frames = await frameQueueItems(supabase, now);
    return { takedowns: frames.takedowns, reports: frames.reports, closed: [] };
  }

  const { data: photoData, error: pErr } = await supabase.from("photos").select("id, storage_path, session_id, uploader_id, hidden_at, removed_at").in("id", photoIds);
  if (pErr) throw new Error(`photos (moderation): ${pErr.message}`);
  const photos = new Map(((photoData ?? []) as PhotoRow[]).map((p) => [p.id, p]));

  const [members, sessionTitles, urls] = await Promise.all([
    people(supabase, [
      ...takedownsOpen.map((t) => t.requester_id),
      ...reportsOpen.map((r) => r.reporter_id),
      ...takedownsClosed.map((t) => t.resolved_by),
      ...reportsClosed.map((r) => r.resolved_by),
    ]),
    titles(supabase, [...photos.values()].map((p) => p.session_id)),
    signed(supabase, [...photos.values()].map((p) => p.storage_path)),
  ]);

  const takedownGroups = groupBy(
    takedownsOpen.map((t) => ({ photo: t.photo_id, who: t.requester_id, at: t.requested_at })),
    (r) => r.photo,
  );
  const reportGroups = groupBy(
    reportsOpen.map((r) => ({ photo: r.photo_id, who: r.reporter_id, at: r.created_at })),
    (r) => r.photo,
  );

  const openItems = (kind: PhotoQueueKind, groups: Map<string, { who: string; at: string }[]>): PhotoQueueItem[] => {
    const items: PhotoQueueItem[] = [];
    for (const [photoId, group] of groups) {
      const p = photos.get(photoId);
      if (!p) continue;
      items.push({
        photoId,
        kind,
        sessionTitle: sessionTitles.get(p.session_id) ?? "",
        thumbUrl: urls.get(p.storage_path) ?? "",
        first: person(members, group[0].who),
        more: new Set(group.map((g) => g.who)).size - 1,
        ageDays: ageDays(group[0].at, now),
      });
    }
    return items;
  };

  // Closed: a photo with nothing open, by its latest decision — a takedown's or a report's, whichever is later.
  const decided = new Map<string, PhotoClosedItem & { at: string }>();
  const consider = (photoId: string | null, kind: PhotoQueueKind, outcome: string | null, by: string | null, at: string | null) => {
    if (!photoId || !at || takedownGroups.has(photoId) || reportGroups.has(photoId)) return;
    const p = photos.get(photoId);
    if (!p) return;
    const prior = decided.get(photoId);
    if (prior && prior.at >= at) return;
    decided.set(photoId, {
      photoId,
      kind,
      sessionTitle: sessionTitles.get(p.session_id) ?? "",
      thumbUrl: urls.get(p.storage_path) ?? "",
      decision: {
        outcome: outcome === "removed" ? "removed" : outcome === "restored" ? "restored" : "dismissed",
        by: person(members, by),
        ageDays: ageDays(at, now),
      },
      at,
    });
  };
  for (const t of takedownsClosed) consider(t.photo_id, "takedowns", t.resolution, t.resolved_by, t.resolved_at);
  for (const r of reportsClosed) consider(r.photo_id, "reports", r.resolution, r.resolved_by, r.resolved_at);

  // ★ Wave 26 (REQ-STO-015, DEC-251 §4.8): a reported or taken-down story FRAME joins the same two chips — the photo
  // queue takes it, video included. Its own detail plays it and decides it through `decide_story_frame()`.
  const frames = await frameQueueItems(supabase, now);

  return {
    takedowns: [...openItems("takedowns", takedownGroups), ...frames.takedowns],
    reports: [...openItems("reports", reportGroups), ...frames.reports],
    closed: [...decided.values()].sort((a, b) => b.at.localeCompare(a.at)).map((item) => ({ photoId: item.photoId, kind: item.kind, sessionTitle: item.sessionTitle, thumbUrl: item.thumbUrl, decision: item.decision })),
  };
}

export type PhotoStatus = "hidden" | "visible" | "removed";

export interface PhotoForModeration {
  photoId: string;
  imageUrl: string;
  sessionId: string;
  sessionTitle: string;
  uploader: ModerationPerson | null;
  status: PhotoStatus;
  /** Open takedown requests, oldest first. */
  requests: { requester: ModerationPerson | null; ageDays: number }[];
  /** Open reports, oldest first — the oldest one's id is what a dismissal is called with. */
  reports: { reportId: string; reporter: ModerationPerson | null; reason: string; ageDays: number }[];
}

/** One photo and what is open on it — the detail beside the queue. A decided photo is still shown, with its status
 *  and no decision to make. */
export async function getPhotoForModeration(locale: string, photoId: string): Promise<PhotoForModeration | null> {
  if (!z.uuid().safeParse(photoId).success) return null;
  const client = await requireStaff(locale);
  if (!client) return null;
  const { supabase } = client;
  const now = Date.now();

  const { data: p, error } = await supabase.from("photos").select("id, storage_path, session_id, uploader_id, hidden_at, removed_at").eq("id", photoId).maybeSingle();
  if (error) throw new Error(`photos (moderation detail): ${error.message}`);
  if (!p) return null;
  const photo = p as PhotoRow;

  const [t, r] = await Promise.all([
    supabase.from("photo_takedowns").select("id, requester_id, requested_at").eq("photo_id", photoId).is("resolved_at", null).order("requested_at", { ascending: true }).order("id", { ascending: true }),
    supabase
      .from("reports")
      .select("id, reporter_id, reason, created_at")
      .eq("target", "photo")
      .eq("photo_id", photoId)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  if (t.error) throw new Error(`photo_takedowns (moderation detail): ${t.error.message}`);
  if (r.error) throw new Error(`reports (moderation detail): ${r.error.message}`);
  const takedowns = (t.data ?? []) as { id: string; requester_id: string; requested_at: string }[];
  const reports = (r.data ?? []) as { id: string; reporter_id: string; reason: string; created_at: string }[];

  const [members, sessionTitles, urls] = await Promise.all([
    people(supabase, [photo.uploader_id, ...takedowns.map((x) => x.requester_id), ...reports.map((x) => x.reporter_id)]),
    titles(supabase, [photo.session_id]),
    signed(supabase, [photo.storage_path]),
  ]);

  return {
    photoId: photo.id,
    imageUrl: urls.get(photo.storage_path) ?? "",
    sessionId: photo.session_id,
    sessionTitle: sessionTitles.get(photo.session_id) ?? "",
    uploader: person(members, photo.uploader_id),
    status: photo.removed_at ? "removed" : photo.hidden_at ? "hidden" : "visible",
    requests: takedowns.map((x) => ({ requester: person(members, x.requester_id), ageDays: ageDays(x.requested_at, now) })),
    reports: reports.map((x) => ({ reportId: x.id, reporter: person(members, x.reporter_id), reason: x.reason, ageDays: ageDays(x.created_at, now) })),
  };
}

const removePhotoInput = z.object({ photoId: z.uuid(), reason: z.string().trim().max(300) });

/** «احذف نهائيًا» — `remove_photo()` (0059): removes and hides the photo and closes its open takedowns and reports in
 *  one transaction; `photo.removed`, `report.resolved` and the reversal are triggers'. */
export async function removeModeratedPhoto(locale: string, input: z.input<typeof removePhotoInput>): Promise<ModerationResult> {
  const parsed = removePhotoInput.safeParse(input);
  if (!parsed.success) return { done: false, error: "unknown" };
  if (parsed.data.reason.length < 3) return { done: false, error: "reason_required" };
  const client = await requireStaff(locale);
  if (!client) return { done: false, error: "not_authorized" };
  const { data, error } = await client.supabase.rpc("remove_photo", { p_photo: parsed.data.photoId, p_reason: parsed.data.reason });
  if (error) return { done: false, error: errorOf(error.message) };
  return (data as { removed_at?: string | null } | null)?.removed_at ? { done: true } : { done: false, error: "unknown" };
}

const restoreInput = z.object({ photoId: z.uuid() });

/** «أعدها للعرض» — ONE write (notes/content.md F3): the photo's open takedowns resolved as `restored`, and 0037's
 *  `photo_takedowns_guard()` unhides the photo inside the same statement; `photo.restored` is 0051's trigger. A write
 *  that matched no row was not written, and says so (DEC-232 §3.1). */
export async function restoreModeratedPhoto(locale: string, input: z.input<typeof restoreInput>): Promise<ModerationResult> {
  const parsed = restoreInput.safeParse(input);
  if (!parsed.success) return { done: false, error: "unknown" };
  const client = await requireStaff(locale);
  if (!client) return { done: false, error: "not_authorized" };
  const { data, error } = await client.supabase
    .from("photo_takedowns")
    .update({ resolved_at: new Date().toISOString(), resolution: "restored" })
    .eq("photo_id", parsed.data.photoId)
    .is("resolved_at", null)
    .select("id");
  if (error) throw new Error(`photo_takedowns (restore): ${error.message}`);
  return (data ?? []).length > 0 ? { done: true } : { done: false, error: "already_resolved" };
}


// ── wave 26 — a story frame in SCR-051 (REQ-STO-014, REQ-STO-015, REQ-STO-017; DEC-251 §4.8 – §4.9) ─────────────────
// `content`'s, add-only, for a video in the queue (and a photo frame reported AS a frame). A frame report hides the
// FRAME only — the photograph stays in the album (REQ-EVT-008) — so its decision is the frame's: `decide_story_frame()`.

export const FRAME_SEGMENT = "frame-";

type FrameRow = {
  id: string;
  kind: "photo" | "video";
  session_id: string;
  author_id: string | null;
  photo_id: string | null;
  caption: string | null;
  poster_path: string | null;
  video_path: string | null;
  hidden_at: string | null;
  removed_at: string | null;
  photo: { storage_path: string; uploader_id: string; caption: string | null } | null;
};
const FRAME_COLUMNS = "id, kind, session_id, author_id, photo_id, caption, poster_path, video_path, hidden_at, removed_at, photo:photos(storage_path, uploader_id, caption)";
const STORY_MEDIA_TTL_S = 600;

async function frameMedia(supabase: Supabase, rows: FrameRow[]): Promise<Map<string, { thumb: string; image: string; video: string }>> {
  const out = new Map<string, { thumb: string; image: string; video: string }>();
  const photoPaths = rows.filter((r) => r.kind === "photo" && r.photo).map((r) => r.photo!.storage_path);
  const videoPaths = rows.filter((r) => r.kind === "video").flatMap((r) => [r.poster_path, r.video_path].filter((v): v is string => !!v));
  const [photos, media] = await Promise.all([
    signed(supabase, photoPaths),
    videoPaths.length ? supabase.storage.from("story-media").createSignedUrls(videoPaths, STORY_MEDIA_TTL_S) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);
  const byPath = new Map((media.data ?? []).map((m) => [m.path ?? "", m.signedUrl]));
  for (const r of rows) {
    if (r.kind === "photo") {
      const url = r.photo ? (photos.get(r.photo.storage_path) ?? "") : "";
      out.set(r.id, { thumb: url, image: url, video: "" });
    } else out.set(r.id, { thumb: byPath.get(r.poster_path ?? "") ?? "", image: byPath.get(r.poster_path ?? "") ?? "", video: byPath.get(r.video_path ?? "") ?? "" });
  }
  return out;
}

async function frameQueueItems(supabase: Supabase, now: number): Promise<{ takedowns: PhotoQueueItem[]; reports: PhotoQueueItem[] }> {
  const [t, r] = await Promise.all([
    supabase.from("story_frame_takedowns").select("frame_id, requester_id, requested_at").is("resolved_at", null).order("requested_at", { ascending: true }).order("id", { ascending: true }),
    supabase
      .from("reports")
      .select("story_frame_id, reporter_id, created_at")
      .eq("target", "story_frame")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  if (t.error) throw new Error(`story_frame_takedowns (open): ${t.error.message}`);
  if (r.error) throw new Error(`reports (open frames): ${r.error.message}`);
  const takedowns = groupBy(((t.data ?? []) as { frame_id: string; requester_id: string; requested_at: string }[]).map((x) => ({ id: x.frame_id, who: x.requester_id, at: x.requested_at })), (x) => x.id);
  const reports = groupBy(((r.data ?? []) as { story_frame_id: string; reporter_id: string; created_at: string }[]).map((x) => ({ id: x.story_frame_id, who: x.reporter_id, at: x.created_at })), (x) => x.id);
  const ids = [...new Set([...takedowns.keys(), ...reports.keys()])];
  if (ids.length === 0) return { takedowns: [], reports: [] };

  const { data, error } = await supabase.from("story_frames").select(FRAME_COLUMNS).in("id", ids);
  if (error) throw new Error(`story_frames (moderation): ${error.message}`);
  const rows = ((data ?? []) as unknown as FrameRow[]).filter((f) => !f.removed_at);
  const byId = new Map(rows.map((f) => [f.id, f]));
  const [members, sessionTitles, media] = await Promise.all([
    people(supabase, [...takedowns.values(), ...reports.values()].flat().map((x) => x.who)),
    titles(supabase, rows.map((f) => f.session_id)),
    frameMedia(supabase, rows),
  ]);
  const items = (kind: PhotoQueueKind, groups: Map<string, { who: string; at: string }[]>): PhotoQueueItem[] =>
    [...groups].flatMap(([id, group]) => {
      const f = byId.get(id);
      if (!f) return [];
      return [
        {
          photoId: `${FRAME_SEGMENT}${id}`,
          frameId: id,
          video: f.kind === "video",
          kind,
          sessionTitle: sessionTitles.get(f.session_id) ?? "",
          thumbUrl: media.get(id)?.thumb ?? "",
          first: person(members, group[0].who),
          more: new Set(group.map((g) => g.who)).size - 1,
          ageDays: ageDays(group[0].at, now),
        },
      ];
    });
  return { takedowns: items("takedowns", takedowns), reports: items("reports", reports) };
}

export interface FrameForModeration {
  frameId: string;
  kind: "photo" | "video";
  imageUrl: string;
  /** A video's rendition — played in the detail (REQ-STO-015). */
  videoUrl: string;
  posterUrl: string;
  caption: string | null;
  sessionId: string;
  sessionTitle: string;
  author: ModerationPerson | null;
  status: PhotoStatus;
  requests: { requester: ModerationPerson | null; ageDays: number }[];
  reports: { reportId: string; reporter: ModerationPerson | null; reason: string; ageDays: number }[];
}

/** One story frame and what is open on it. Staff only, at the data — `null` otherwise. */
export async function getStoryFrameForModeration(locale: string, frameId: string): Promise<FrameForModeration | null> {
  if (!z.uuid().safeParse(frameId).success) return null;
  const client = await requireStaff(locale);
  if (!client) return null;
  const { supabase } = client;
  const now = Date.now();

  const { data, error } = await supabase.from("story_frames").select(FRAME_COLUMNS).eq("id", frameId).in("kind", ["photo", "video"]).maybeSingle();
  if (error) throw new Error(`story_frames (moderation detail): ${error.message}`);
  if (!data) return null;
  const f = data as unknown as FrameRow;

  const [t, r] = await Promise.all([
    supabase.from("story_frame_takedowns").select("id, requester_id, requested_at").eq("frame_id", frameId).is("resolved_at", null).order("requested_at", { ascending: true }).order("id", { ascending: true }),
    supabase
      .from("reports")
      .select("id, reporter_id, reason, created_at")
      .eq("target", "story_frame")
      .eq("story_frame_id", frameId)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  if (t.error) throw new Error(`story_frame_takedowns (moderation detail): ${t.error.message}`);
  if (r.error) throw new Error(`reports (frame detail): ${r.error.message}`);
  const takedowns = (t.data ?? []) as { id: string; requester_id: string; requested_at: string }[];
  const reports = (r.data ?? []) as { id: string; reporter_id: string; reason: string; created_at: string }[];
  const authorId = f.kind === "photo" ? (f.photo?.uploader_id ?? null) : f.author_id;

  const [members, sessionTitles, media] = await Promise.all([
    people(supabase, [authorId, ...takedowns.map((x) => x.requester_id), ...reports.map((x) => x.reporter_id)]),
    titles(supabase, [f.session_id]),
    frameMedia(supabase, [f]),
  ]);
  const m = media.get(f.id);
  return {
    frameId: f.id,
    kind: f.kind,
    imageUrl: m?.image ?? "",
    videoUrl: m?.video ?? "",
    posterUrl: f.kind === "video" ? (m?.thumb ?? "") : "",
    caption: f.kind === "photo" ? (f.photo?.caption ?? null) : f.caption,
    sessionId: f.session_id,
    sessionTitle: sessionTitles.get(f.session_id) ?? "",
    author: person(members, authorId),
    status: f.removed_at ? "removed" : f.hidden_at ? "hidden" : "visible",
    requests: takedowns.map((x) => ({ requester: person(members, x.requester_id), ageDays: ageDays(x.requested_at, now) })),
    reports: reports.map((x) => ({ reportId: x.id, reporter: person(members, x.reporter_id), reason: x.reason, ageDays: ageDays(x.created_at, now) })),
  };
}

const decideFrameInput = z.object({ frameId: z.uuid(), outcome: z.enum(["removed", "restored", "dismissed"]), reason: z.string().trim().max(300).optional() });

/** A frame's decision — `decide_story_frame()`: restored or dismissed clear the FRAME's hide and close what is open on
 *  it; removed is `remove_story_frame()` (a photo frame through `remove_photo()`). `report.resolved`,
 *  `story_frame.removed` / `.restored` and a photo's `photo.removed` with its reversal are triggers'. */
export async function decideModeratedFrame(locale: string, input: z.input<typeof decideFrameInput>): Promise<ModerationResult> {
  const parsed = decideFrameInput.safeParse(input);
  if (!parsed.success) return { done: false, error: "unknown" };
  if (parsed.data.outcome === "removed" && (parsed.data.reason ?? "").length < 3) return { done: false, error: "reason_required" };
  const client = await requireStaff(locale);
  if (!client) return { done: false, error: "not_authorized" };
  const { data, error } = await client.supabase.rpc("decide_story_frame", { p_frame: parsed.data.frameId, p_outcome: parsed.data.outcome, p_reason: parsed.data.reason ?? null });
  if (error) return { done: false, error: errorOf(error.message) };
  const outcome = (data as { outcome?: string } | null)?.outcome;
  if (outcome === parsed.data.outcome) return { done: true };
  if (outcome === "already_removed") return { done: false, error: "already_resolved" };
  return { done: false, error: errorOf(outcome ?? "unknown") };
}
