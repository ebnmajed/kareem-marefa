import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { photoStoryPath, storyVideoSourcePath, type StoryVideoSourceExt } from "@/lib/storage/paths";

// Session stories — the attendee half (REQ-STO-005, REQ-STO-010 … REQ-STO-017, DEC-248, DEC-251). `content`'s module;
// `sessions'` `stories.ts` is the read model of a session's story and this module never reads a session's tables.
//
// What lives here: the media hrefs `stories.ts` hands me ids for (a photograph's `story` derivative, a video and its
// poster), the capture gate's hint, the two capture doors (a photograph through the album's own job, a video into the
// `story-media` bucket), views, and a frame's reports and removal requests. Every write is a definer function or a
// policy-checked insert; this module's checks are shape, never authority (CLAUDE.md «Validation»).

/** A video's signed URL outlives a viewing (a range request mid-play must not 400) and is re-signed on every refresh. */
const VIDEO_TTL_S = 600;
/** The album's own thumbnail lifetime (`photos.ts`). */
const PHOTO_TTL_S = 3600;

export interface StoryMediaHrefs {
  /** photoId → the `story` derivative's signed URL, or the stripped original's when it has none. */
  photos: Record<string, string>;
  /** frameId → the rendition and its poster. Absent for a frame that is not visible. */
  videos: Record<string, { videoUrl: string; posterUrl: string; durationMs: number | null }>;
}

/** REQ-STO-012, REQ-STO-016 — signed with the caller's own client, so `photos_storage_read` and `story-media`'s read
 *  policy decide: a photograph the caller may not see, a hidden frame, an expired one, yields no href at all. */
export async function getStoryMediaHrefs(locale: string, ids: { photoIds: string[]; videoFrameIds: string[] }): Promise<StoryMediaHrefs> {
  const photoIds = [...new Set(ids.photoIds)].filter((id) => z.uuid().safeParse(id).success);
  const frameIds = [...new Set(ids.videoFrameIds)].filter((id) => z.uuid().safeParse(id).success);
  const out: StoryMediaHrefs = { photos: {}, videos: {} };
  if (photoIds.length === 0 && frameIds.length === 0) return out;
  const { supabase } = await sessionClient(locale);

  if (photoIds.length > 0) {
    const { data, error } = await supabase.from("photos").select("id, org_id, session_id, storage_path, story_derivative_ready").in("id", photoIds);
    if (error) throw new Error(`story media (photos): ${error.message}`);
    const paths = (data ?? []).map((p) =>
      p.story_derivative_ready ? photoStoryPath(p.org_id as string, p.session_id as string, p.id as string) : (p.storage_path as string),
    );
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from("photos").createSignedUrls(paths, PHOTO_TTL_S);
      (data ?? []).forEach((p, i) => {
        const url = signed?.[i]?.signedUrl;
        if (url) out.photos[p.id as string] = url;
      });
    }
  }

  if (frameIds.length > 0) {
    const { data, error } = await supabase
      .from("story_frames")
      .select("id, video_path, poster_path, duration_ms")
      .in("id", frameIds)
      .eq("kind", "video")
      .eq("state", "visible");
    if (error) throw new Error(`story media (videos): ${error.message}`);
    const rows = (data ?? []).filter((r) => r.video_path && r.poster_path);
    const paths = rows.flatMap((r) => [r.video_path as string, r.poster_path as string]);
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from("story-media").createSignedUrls(paths, VIDEO_TTL_S);
      rows.forEach((r, i) => {
        const videoUrl = signed?.[i * 2]?.signedUrl;
        const posterUrl = signed?.[i * 2 + 1]?.signedUrl;
        if (videoUrl && posterUrl) out.videos[r.id as string] = { videoUrl, posterUrl, durationMs: (r.duration_ms as number | null) ?? null };
      });
    }
  }
  return out;
}

/** REQ-STO-011 — «أضف» is drawn only when this says so. A HINT: every capture door re-derives the same gate. */
export async function canAddToStory(locale: string, sessionIds: string[]): Promise<Record<string, boolean>> {
  const ids = [...new Set(sessionIds)].filter((id) => z.uuid().safeParse(id).success);
  if (ids.length === 0) return {};
  const { supabase } = await sessionClient(locale);
  const answers = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await supabase.rpc("story_capture_open", { p_session: id });
      return [id, !error && data === true] as const;
    }),
  );
  return Object.fromEntries(answers);
}

// ─── the capture: a photograph rides the album's own job ─────────────────────────────────────────────────────────

export const completeStoryPhotoInput = z.object({
  photoId: z.uuid(),
  sessionId: z.uuid(),
  path: z.string().trim().min(1).max(1024),
  kind: z.enum(["jpeg", "png", "webp"]),
  byteSize: z.number().int().positive(),
  caption: z.string().trim().max(100).optional(),
});

/** REQ-STO-011, REQ-STO-012 — the bytes were PUT through `initiatePhotoUpload()`, the album's own door; this hands them
 *  to `initiate_story_photo()`, which re-derives the capture gate and enqueues the album's `process_photo` with the
 *  caption. The member is told the photograph is processing, never that it was posted (DEC-139). */
export async function completeStoryPhoto(locale: string, input: z.input<typeof completeStoryPhotoInput>): Promise<{ status: "processing" }> {
  const parsed = completeStoryPhotoInput.parse(input);
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("initiate_story_photo", {
    p_photo_id: parsed.photoId,
    p_session_id: parsed.sessionId,
    p_storage_path: parsed.path,
    p_declared_kind: parsed.kind,
    p_declared_byte_size: parsed.byteSize,
    p_caption: parsed.caption || null,
  });
  if (error) throw new Error(mapCaptureError(error));
  return { status: "processing" };
}

// ─── the capture: a video into `story-media` ─────────────────────────────────────────────────────────────────────

/** 60 MB — the bucket's own `file_size_limit` is the edge; this is a courtesy refusal before the PUT. */
export const STORY_VIDEO_MAX_BYTES = 60 * 1024 * 1024;

export const initiateStoryVideoInput = z.object({
  sessionId: z.uuid(),
  ext: z.enum(["mp4", "mov", "webm"]),
  declaredByteSize: z.number().int().positive().max(STORY_VIDEO_MAX_BYTES),
});

const CONTENT_TYPE: Record<StoryVideoSourceExt, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

export interface InitiatedStoryVideo {
  frameId: string;
  upload: { bucket: "story-media"; path: string; signedUrl: string; token: string; contentType: string };
}

/** REQ-STO-016 — a signed upload URL under a freshly minted frame id. `story-media`'s write policy (0198), which calls
 *  `story_capture_open()`, is what permits or refuses it: a member outside the gate gets `42501` from Storage itself. */
export async function initiateStoryVideo(locale: string, input: z.input<typeof initiateStoryVideoInput>): Promise<InitiatedStoryVideo> {
  const parsed = initiateStoryVideoInput.parse(input);
  const { session, supabase } = await sessionClient(locale);
  const frameId = randomUUID();
  const path = storyVideoSourcePath(session.orgId, parsed.sessionId, frameId, parsed.ext);
  const { data, error } = await supabase.storage.from("story-media").createSignedUploadUrl(path);
  if (error || !data) throw new Error(mapCaptureError(error));
  return { frameId, upload: { bucket: "story-media", path, signedUrl: data.signedUrl, token: data.token, contentType: CONTENT_TYPE[parsed.ext] } };
}

export const completeStoryVideoInput = z.object({
  frameId: z.uuid(),
  sessionId: z.uuid(),
  path: z.string().trim().min(1).max(1024),
  byteSize: z.number().int().positive(),
  caption: z.string().trim().max(100).optional(),
});

/** REQ-STO-016 — after the PUT: `begin_story_video()` writes the `processing` frame and enqueues the transcode. */
export async function completeStoryVideo(locale: string, input: z.input<typeof completeStoryVideoInput>): Promise<{ status: "processing"; frameId: string }> {
  const parsed = completeStoryVideoInput.parse(input);
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("begin_story_video", {
    p_frame_id: parsed.frameId,
    p_session_id: parsed.sessionId,
    p_storage_path: parsed.path,
    p_declared_byte_size: parsed.byteSize,
    p_caption: parsed.caption || null,
  });
  if (error) throw new Error(mapCaptureError(error));
  return { status: "processing", frameId: parsed.frameId };
}

function mapCaptureError(error: { code?: string; message: string } | null): string {
  if (error?.code === "42501" || /row-level security|not_authorized|Unauthorized/i.test(error?.message ?? "")) return "not_authorized";
  if (error?.code === "23514" || error?.message.startsWith("file_too_large")) return "file_too_large";
  if (error?.code === "22001") return "caption_too_long";
  return `stories: ${error?.message ?? "the capture failed"}`;
}

// ─── views (REQ-STO-010) ─────────────────────────────────────────────────────────────────────────────────────────

/** Once per member per frame: a plain insert under the self-only policy, whose check reads the frame under the
 *  caller's own RLS — so a view is written only for a frame the member may see now. A repeat is nothing. */
export async function recordStoryViews(locale: string, frameIds: string[]): Promise<void> {
  const ids = [...new Set(frameIds)].filter((id) => z.uuid().safeParse(id).success).slice(0, 100);
  if (ids.length === 0) return;
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("story_views")
    .upsert(ids.map((frame_id) => ({ org_id: session.orgId, member_id: session.memberId, frame_id })), { onConflict: "member_id,frame_id", ignoreDuplicates: true });
  if (error) throw new Error(`story_views: ${error.message}`);
}

// ─── a member's moderation of a frame (REQ-STO-014, REQ-STO-015) ─────────────────────────────────────────────────

export type FrameReportOutcome = "reported" | "already_reported" | "own_frame" | "not_visible" | "not_reportable" | "reason_required";

/** One report hides the FRAME at once and goes to the photo queue (DEC-251 §4.8); a photo frame's photograph stays in
 *  the album (REQ-EVT-008). */
export async function reportStoryFrame(locale: string, frameId: string, reason: string): Promise<FrameReportOutcome> {
  const id = z.uuid().parse(frameId);
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("report_story_frame", { p_frame: id, p_reason: reason });
  if (error) throw new Error(`report_story_frame: ${error.message}`);
  return (data as { outcome: FrameReportOutcome }).outcome;
}

export type FrameTakedownOutcome = "hidden" | "already_requested" | "not_visible" | "use_photo_takedown";

/** «أزلني» on a VIDEO frame — hidden for everyone at once (REQ-STO-014). A photo frame's «أزلني» is the photograph's
 *  own takedown (`requestPhotoTakedown()` in `photos.ts`), which hides both. */
export async function requestStoryFrameTakedown(locale: string, frameId: string): Promise<FrameTakedownOutcome> {
  const id = z.uuid().parse(frameId);
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("request_story_frame_takedown", { p_frame: id });
  if (error) throw new Error(`request_story_frame_takedown: ${error.message}`);
  return (data as { outcome: FrameTakedownOutcome }).outcome;
}

// ─── staff: SCR-044's «قصص الحضور» (REQ-STO-017) ─────────────────────────────────────────────────────────────────

export interface AttendeeStoryFrame {
  id: string;
  kind: "photo" | "video";
  state: "processing" | "visible" | "failed";
  triggeredAt: string;
  hidden: boolean;
  authorName: string | null;
  authorTeamColor: string | null;
  /** The thumbnail: a photograph's `story` derivative (or original), a video's poster; null while processing. */
  thumbUrl: string | null;
  durationMs: number | null;
}

/** Every attendee frame of a session — expired too (staff read every frame of their org) — not removed, newest first.
 *  Null for anyone who is not staff: the page is staff's, and RLS would show a member a narrower set anyway. */
export async function listAttendeeStoryFrames(locale: string, sessionId: string): Promise<AttendeeStoryFrame[] | null> {
  const sid = z.uuid().parse(sessionId);
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return null;

  const { data, error } = await supabase
    .from("story_frames")
    .select(
      "id, kind, state, triggered_at, hidden_at, author_id, photo_id, poster_path, duration_ms, author:members!story_frames_author_id_fkey(display_name, company:companies(team_color)), photo:photos(org_id, session_id, storage_path, story_derivative_ready, removed_at, hidden_at, uploader:members!photos_uploader_id_fkey(display_name, company:companies(team_color)))",
    )
    .eq("session_id", sid)
    .in("kind", ["photo", "video"])
    .is("removed_at", null)
    .order("triggered_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(`story_frames (staff): ${error.message}`);

  type Person = { display_name: string | null; company: { team_color: string | null } | null } | null;
  type Row = {
    id: string;
    kind: "photo" | "video";
    state: AttendeeStoryFrame["state"];
    triggered_at: string;
    hidden_at: string | null;
    photo_id: string | null;
    poster_path: string | null;
    duration_ms: number | null;
    author: Person;
    photo: { org_id: string; session_id: string; storage_path: string; story_derivative_ready: boolean; removed_at: string | null; hidden_at: string | null; uploader: Person } | null;
  };
  // A removed photograph's frame is gone from the strip with it (DEC-251 §4.9).
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.kind === "video" || (r.photo && !r.photo.removed_at));

  const photoPaths = rows.flatMap((r) =>
    r.kind === "photo" && r.photo ? [r.photo.story_derivative_ready && r.photo_id ? photoStoryPath(r.photo.org_id, r.photo.session_id, r.photo_id) : r.photo.storage_path] : [],
  );
  const posterPaths = rows.flatMap((r) => (r.kind === "video" && r.poster_path ? [r.poster_path] : []));
  const [photos, posters] = await Promise.all([
    photoPaths.length ? supabase.storage.from("photos").createSignedUrls(photoPaths, PHOTO_TTL_S) : Promise.resolve({ data: [] }),
    posterPaths.length ? supabase.storage.from("story-media").createSignedUrls(posterPaths, VIDEO_TTL_S) : Promise.resolve({ data: [] }),
  ]);
  let pi = 0;
  let vi = 0;
  return rows.map((r) => {
    const person = r.kind === "photo" ? (r.photo?.uploader ?? null) : r.author;
    let thumbUrl: string | null = null;
    if (r.kind === "photo") thumbUrl = photos.data?.[pi++]?.signedUrl ?? null;
    else if (r.poster_path) thumbUrl = posters.data?.[vi++]?.signedUrl ?? null;
    return {
      id: r.id,
      kind: r.kind,
      state: r.state,
      triggeredAt: r.triggered_at,
      hidden: !!r.hidden_at || !!r.photo?.hidden_at,
      authorName: person?.display_name ?? null,
      authorTeamColor: person?.company?.team_color ?? null,
      thumbUrl,
      durationMs: r.duration_ms,
    };
  });
}

export type RemoveFrameOutcome = "removed" | "already_removed" | "not_found" | "not_authorized" | "reason_required" | "not_removable";

/** REQ-STO-017 — `remove_story_frame()`: a photo frame through `remove_photo()` (its audit row and its compensating
 *  «حُذف المحتوى» row are 0059's triggers), a video frame removed, audited by 0198's trigger and purged. */
export async function removeStoryFrame(locale: string, frameId: string, reason: string): Promise<RemoveFrameOutcome> {
  const id = z.uuid().parse(frameId);
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("remove_story_frame", { p_frame: id, p_reason: reason });
  if (error) throw new Error(`remove_story_frame: ${error.message}`);
  return (data as { outcome: RemoveFrameOutcome }).outcome;
}
