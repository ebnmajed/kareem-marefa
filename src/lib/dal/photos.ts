import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { photoPath } from "@/lib/storage/paths";
// Contract 3 (DEC-150) — the day set, read only through `sessions'` own module.
import { getSessionHeading, listSessionDays, type SessionDay } from "@/lib/dal/sessions";

// Photos — REQ-EVT-009 … REQ-EVT-014, 02 §4.7, 03 §5.6c, 07 §9.
//
// Two Route Handlers (uploads are Route Handlers, never Server Actions —
// CLAUDE.md), the same two-step shape as materials:
//
//   POST /api/upload/photo           → initiatePhotoUpload()
//   POST /api/upload/photo/complete  → completePhotoUpload()
//
// Unlike materials, `completePhotoUpload` never reads the bytes back
// itself — it CANNOT (`photos_storage_read`, 03 §6, denies everyone,
// including the uploader, until a matching `photos` row exists, and that
// row cannot exist unstripped, `check (exif_stripped)`, 0037). It only
// hands the already-uploaded object off to `initiate_photo_processing()`
// (supabase/proposed/content/0007), which enqueues `process_photo` — the
// worker is the only process that ever reads the raw bytes, strips them,
// and creates the row (REQ-EVT-011, DEC-047; docs/plan/notes/content.md
// §1.6). This module's own checks are shape, never authority: `photos_
// storage_write` (REQ-EVT-009's has_checked_in()/is_presenter_of()/
// is_staff() gate) is what actually permits or refuses the signed upload
// URL itself.

export const photoKindSchema = z.enum(["jpeg", "png", "webp"]);
export type PhotoKind = z.infer<typeof photoKindSchema>;

const EXT_FOR_KIND: Record<PhotoKind, "jpg" | "png" | "webp"> = { jpeg: "jpg", png: "png", webp: "webp" };
const CONTENT_TYPE_FOR_KIND: Record<PhotoKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const initiatePhotoUploadInput = z.object({
  sessionId: z.uuid(),
  kind: photoKindSchema,
  declaredByteSize: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024), // a courtesy ceiling only — record_photo_upload's org-limit check is the control
});
export type InitiatePhotoUploadInput = z.infer<typeof initiatePhotoUploadInput>;

export interface InitiatedPhotoUpload {
  photoId: string;
  upload: { bucket: "photos"; path: string; signedUrl: string; token: string; contentType: string };
}

/** REQ-EVT-009/010: mints the signed upload URL under a freshly minted photo id. `photos_storage_
 *  write` (checked-in / presenter / staff, for THIS session) is what actually gates this call —
 *  a member who fails that gate gets `42501` from `createSignedUploadUrl` itself. */
export async function initiatePhotoUpload(locale: string, input: InitiatePhotoUploadInput): Promise<InitiatedPhotoUpload> {
  const { session, supabase } = await sessionClient(locale);

  const photoId = randomUUID();
  const path = photoPath(session.orgId, input.sessionId, photoId, EXT_FOR_KIND[input.kind]);
  const { data: signed, error } = await supabase.storage.from("photos").createSignedUploadUrl(path);
  if (error || !signed) throw new Error(mapPhotoError(error));

  return {
    photoId,
    upload: { bucket: "photos", path, signedUrl: signed.signedUrl, token: signed.token, contentType: CONTENT_TYPE_FOR_KIND[input.kind] },
  };
}

function mapPhotoError(error: { code?: string; message: string } | null): string {
  if (error?.code === "42501") return "not_authorized";
  return `photos: ${error?.message ?? "could not sign an upload URL"}`;
}

export const completePhotoUploadInput = z.object({
  photoId: z.uuid(),
  sessionId: z.uuid(),
  path: z.string().trim().min(1).max(1024),
  kind: photoKindSchema,
  byteSize: z.number().int().positive(),
});
export type CompletePhotoUploadInput = z.infer<typeof completePhotoUploadInput>;

/** REQ-EVT-011: never reads the bytes back (it cannot — see this module's header). Only hands the
 *  already-uploaded object to the worker via `initiate_photo_processing()`, which re-derives
 *  authority and enqueues `process_photo` keyed `photo:{photo_id}`. */
export async function completePhotoUpload(locale: string, input: CompletePhotoUploadInput): Promise<{ status: "processing" }> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("initiate_photo_processing", {
    p_photo_id: input.photoId,
    p_session_id: input.sessionId,
    p_storage_path: input.path,
    p_declared_kind: input.kind,
    p_declared_byte_size: input.byteSize,
  });
  if (error) throw new Error(mapInitiateProcessingError(error));
  return { status: "processing" };
}

function mapInitiateProcessingError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "not_authorized";
  if (error.message.startsWith("file_too_large")) return error.message;
  return `initiate_photo_processing: ${error.message}`;
}

export interface PhotoSummary {
  id: string;
  uploaderId: string;
  createdAt: string;
  url: string;
  /** Present only when the viewer is staff (`photos_read`, 03 §6) — a plain member never sees a hidden photo at all. */
  hiddenAt: string | null;
  /** REQ-SES-018/DEC-121: never chosen by the uploader — `record_photo_upload()` resolves it from
   *  the upload's own moment, and leaves it null while the session has one day. Absent or null
   *  both read as the whole session (`item.sessionDayId ?? null`); OPTIONAL, not required, so an
   *  existing fixture literal that predates this field still type-checks without editing a file
   *  rule 4 asks to stay untouched. */
  sessionDayId?: string | null;
  /** The stripped image's own pixel size (`record_photo_upload()`, 0050) — the lightbox reserves
   *  its box from these (REQ-EVT-016). OPTIONAL for the same reason as `sessionDayId`. */
  width?: number | null;
  height?: number | null;
  /** Wave 18, add-only (DEC-209): the uploader's company colour, drawn as a ring dot on the tile
   *  (`EventLive.dc.html:64`) — `#rrggbb` or null; reaches the DOM only as `--team`. OPTIONAL for the same
   *  reason as `width`. */
  uploaderTeamColor?: string | null;
}

/** The session's album for staff (`photo_albums`, 0156; DEC-182) — the state «تنزيل الكل» reads,
 *  the same after a reload. `parts` is how many self-contained zips the build wrote. */
export interface PhotoAlbumState {
  status: "queued" | "building" | "ready" | "failed" | "stale";
  photoCount: number | null;
  byteSize: number | null;
  parts: number;
  expiresAt: string | null;
}

export interface PhotosPageData {
  photos: PhotoSummary[];
  /** REQ-EVT-009 — a UI hint only; `photos_storage_write` is the real gate regardless of what this says. */
  canUpload: boolean;
  isStaff: boolean;
  myMemberId: string;
  /** `org_settings.limit_image_mb` (shared with materials' `image` kind) — read so the uploader can
   *  state the size ceiling BEFORE a file is chosen (`REQ-UIX-024`), same reasoning as
   *  `materials.ts`'s `MaterialUploadLimits`. Advisory only; `record_photo_upload`'s own check
   *  (`0050_photo_pipeline.sql`) against the real byte size is the control. */
  imageLimitMb: number;
  /** Contract 3 — every day of the session, in order; `[]`/absent at one day or none scheduled.
   *  Display-only for photos (DEC-121: "photos never ask") — no per-group upload control reads
   *  this the way materials/tasks' groups do. OPTIONAL, not required — same reasoning as
   *  `PhotoSummary.sessionDayId` (rule 4). */
  days?: SessionDay[];
  /** The session's own zone, else the org's — `dayLabel()`'s weekday reads the room's clock.
   *  OPTIONAL for the same reason as `days`. */
  timeZone?: string;
  /** Staff only — `null` for everyone else and when no album was ever requested. OPTIONAL, not
   *  required: every existing fixture predates it, and `gallery.test.tsx` mocks this module with
   *  `getPhotosPageData` alone, so the album is part of this one read rather than a second one. */
  album?: PhotoAlbumState | null;
}

const DEFAULT_IMAGE_LIMIT_MB = 20;
const DEFAULT_TIME_ZONE = "Asia/Riyadh";

/** The event page's `Photos` slot — REQ-EVT-010: `photos_read`'s own `hidden_at is null or
 *  is_staff()` clause (03 §6) is the entire visibility rule; this never adds a second filter
 *  on top of it, so a plain member's query already excludes hidden photos server-side.
 *
 *  ★ Wrapped in React `cache()` (wave 6, `sessions.md` §22.4 R-C3): the page gates the photos
 *  `<section>` on `photosSummary()` (below), which needs this same read. */
export const getPhotosPageData = cache(async (locale: string, sessionId: string): Promise<PhotosPageData> => {
  if (!z.uuid().safeParse(sessionId).success) {
    return { photos: [], canUpload: false, isStaff: false, myMemberId: "", imageLimitMb: DEFAULT_IMAGE_LIMIT_MB, days: [], timeZone: DEFAULT_TIME_ZONE };
  }
  const { session, supabase } = await sessionClient(locale);
  const isStaff = session.role === "admin" || session.role === "moderator";

  const [{ data: rows, error }, { data: checkedIn }, { data: presents }, { data: settings }, days, heading, { data: albumRow }] = await Promise.all([
    supabase
      .from("photos")
      .select("id, uploader_id, storage_path, created_at, hidden_at, session_day_id, width, height, uploader:members(company:companies(team_color))")
      .eq("session_id", sessionId)
      .is("removed_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("has_checked_in", { p_session: sessionId }),
    supabase.rpc("is_presenter_of", { p_session: sessionId }),
    supabase.from("org_settings").select("limit_image_mb").eq("org_id", session.orgId).maybeSingle(),
    listSessionDays(locale, sessionId),
    getSessionHeading(locale, sessionId),
    // REQ-ADM-021 — staff alone read `photo_albums` (`photo_albums_read_staff`, 0156), so nobody
    // else is asked; RLS would answer nothing anyway.
    isStaff
      ? supabase.from("photo_albums").select("status, photo_count, byte_size, parts, expires_at").eq("session_id", sessionId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error) throw new Error(`photos: ${error.message}`);

  const photos = await Promise.all(
    (rows ?? []).map(async (p): Promise<PhotoSummary> => {
      const { data: signed } = await supabase.storage.from("photos").createSignedUrl(p.storage_path as string, 3600);
      return {
        id: p.id as string,
        uploaderId: p.uploader_id as string,
        createdAt: p.created_at as string,
        url: signed?.signedUrl ?? "",
        hiddenAt: (p.hidden_at as string | null) ?? null,
        sessionDayId: (p.session_day_id as string | null) ?? null,
        width: (p.width as number | null) ?? null,
        height: (p.height as number | null) ?? null,
        uploaderTeamColor: (p.uploader as unknown as { company: { team_color: string | null } | null } | null)?.company?.team_color ?? null,
      };
    }),
  );

  return {
    photos,
    canUpload: !!checkedIn || !!presents || isStaff,
    isStaff,
    myMemberId: session.memberId,
    imageLimitMb: (settings?.limit_image_mb as number | undefined) ?? DEFAULT_IMAGE_LIMIT_MB,
    days,
    timeZone: heading?.timeZone ?? DEFAULT_TIME_ZONE,
    album: toAlbumState(albumRow as AlbumRow | null),
  };
});

interface AlbumRow {
  status: PhotoAlbumState["status"];
  photo_count: number | null;
  byte_size: number | null;
  parts: unknown[] | null;
  expires_at: string | null;
}

/** A ready album past its `expires_at` is no album at all: the definer refuses it and the bucket's
 *  policy hides it (0156), so the slot offers «تنزيل الكل» again rather than a dead link. */
function toAlbumState(row: AlbumRow | null): PhotoAlbumState | null {
  if (!row) return null;
  if (row.status === "ready" && (!row.expires_at || Date.parse(row.expires_at) <= Date.now())) return null;
  return {
    status: row.status,
    photoCount: row.photo_count,
    byteSize: row.byte_size,
    parts: Array.isArray(row.parts) ? row.parts.length : 0,
    expiresAt: row.expires_at,
  };
}

const requestTakedownInput = z.object({ photoId: z.uuid() });

/** REQ-EVT-012 — a plain RLS-gated insert, no RPC: `photo_takedowns_insert_self` (0037) is the
 *  authority, and `photo_takedowns_hide()` (0037/0043) is an AFTER INSERT trigger that hides the
 *  photo and notifies the uploader in the SAME transaction — "the hide takes effect before any
 *  human sees the request" is a property of the trigger, not of this function, which just
 *  performs the insert an authorised member is always free to make on any photo in their org. */
export async function requestPhotoTakedown(locale: string, photoId: string): Promise<boolean> {
  const { photoId: id } = requestTakedownInput.parse({ photoId });
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase.from("photo_takedowns").insert({ org_id: session.orgId, photo_id: id, requester_id: session.memberId });
  if (error) throw new Error(`photo_takedowns: ${error.message}`);
  return true;
}

/** REQ-EVT-012: a moderator/admin clearing a mistaken instant hide. Two plain `p6_staff_update`
 *  writes (photos.hidden_at/hidden_reason, then the open photo_takedowns row's resolution) — a
 *  non-staff caller's UPDATE matches zero rows on both (03 §6), so this returns false rather than
 *  throwing. `photos_audit_staff_actions` (supabase/proposed/content/0008) is what makes the
 *  restore itself audited; this function does not write `audit_log` directly. */
export async function restorePhoto(locale: string, photoId: string): Promise<boolean> {
  const { photoId: id } = requestTakedownInput.parse({ photoId });
  const { session, supabase } = await sessionClient(locale);

  const { data: photoRows, error: photoError } = await supabase.from("photos").update({ hidden_at: null, hidden_reason: null }).eq("id", id).select("id");
  if (photoError) throw new Error(`photos: ${photoError.message}`);
  if ((photoRows ?? []).length === 0) return false;

  await supabase
    .from("photo_takedowns")
    .update({ resolved_at: new Date().toISOString(), resolution: "restored", resolved_by: session.memberId })
    .eq("photo_id", id)
    .is("resolved_at", null);

  return true;
}

const rescopePhotoInput = z.object({ photoId: z.uuid(), sessionDayId: z.uuid().nullable() });

/** REQ-SES-018/DEC-121 — staff alone (a photo has no presenter-write concept: `photos_insert_
 *  checked_in`, 03 §5.6c, never names `is_presenter_of` as an OWNER, only as one of three ways to
 *  be allowed to upload). `session_day_id` is not in `p6_staff_update`'s column grant
 *  (`hidden_at`/`hidden_reason`/`removed_at`/`removed_by`, 0037) — `rescope_photo()`
 *  (proposed/content/0001) is the door, re-deriving `is_staff()` itself. No audit row (matching
 *  `rescopeTask`'s reasoning — no visibility rule turns on a photo's scope). */
export async function rescopePhoto(locale: string, input: z.infer<typeof rescopePhotoInput>): Promise<boolean> {
  const parsed = rescopePhotoInput.parse(input);
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("rescope_photo", { p_photo_id: parsed.photoId, p_day_id: parsed.sessionDayId });
  if (error) throw new Error(mapRescopeError(error));
  return true;
}

function mapRescopeError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "not_authorized";
  if (error.code === "P0002") return "not_found";
  if (error.message.startsWith("day_not_of_session")) return "day_not_of_session";
  return `rescope: ${error.message}`;
}

// ── Downloads — REQ-ADM-021, DEC-180 contract 1, DEC-182 ──────────────────
//
// ★ A route audits, THEN signs, then 303s — never a signed URL in page data and
// never a bare `<a download>` (DEC-177). Each of the three is the caller's own
// session calling one audit definer (`0156`), which re-derives who may take the
// file and writes the audit row; the URL is then minted AS THE CALLER, so the
// bucket's read policy is a second, independent gate. `42501` is the one answer
// for every refusal — an unknown id, another org's, a hidden or removed photo,
// an album not ready — so the route can say only «failed», never which.

/** «Short-lived»: long enough to start the download the 303 hands over, no longer. */
const DOWNLOAD_TTL_S = 60;

export type PhotoDownloadResult = { status: "ok"; url: string } | { status: "refused" } | { status: "failed" };

function firstRow(data: unknown): { storage_path?: string | null; file_name?: string | null } | null {
  return (Array.isArray(data) ? data[0] : data) as { storage_path?: string | null; file_name?: string | null } | null;
}

async function signDownload(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  bucket: "photos" | "photo-albums",
  data: unknown,
): Promise<PhotoDownloadResult> {
  const row = firstRow(data);
  if (!row?.storage_path) return { status: "failed" };
  const { data: signed } = await supabase.storage
    .from(bucket)
    .createSignedUrl(row.storage_path, DOWNLOAD_TTL_S, row.file_name ? { download: row.file_name } : { download: true });
  return signed?.signedUrl ? { status: "ok", url: signed.signedUrl } : { status: "failed" };
}

/** One photograph — anyone who may see it, never a hidden or removed one, staff included
 *  (`record_photo_download()`, DEC-182 Q3). Audits `photo.downloaded`. */
export async function recordPhotoDownload(locale: string, photoId: string): Promise<PhotoDownloadResult> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("record_photo_download", { p_photo: photoId });
  if (error) return error.code === "42501" ? { status: "refused" } : { status: "failed" };
  return signDownload(supabase, "photos", data);
}

export type PhotoAlbumRequestResult = { status: "queued" } | { status: "refused" } | { status: "empty" } | { status: "failed" };

/** «تنزيل الكل» — staff only. `request_photo_album()` audits `photo_album.requested` and enqueues
 *  `JOB-zip_session_photos`; nothing here waits for a byte (REQ-ADM-021: an album never runs
 *  inside a request). `album_empty` (`P0002`) is raised before any write when no photograph is
 *  visible. */
export async function requestPhotoAlbum(locale: string, sessionId: string): Promise<PhotoAlbumRequestResult> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("request_photo_album", { p_session: sessionId });
  if (!error) return { status: "queued" };
  if (error.code === "42501") return { status: "refused" };
  if (error.code === "P0002") return { status: "empty" };
  return { status: "failed" };
}

/** One part of a ready album — staff only. Audits `photo_album.downloaded`. */
export async function recordPhotoAlbumDownload(locale: string, sessionId: string, part: number): Promise<PhotoDownloadResult> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("record_photo_album_download", { p_session: sessionId, p_part: part });
  if (error) return error.code === "42501" ? { status: "refused" } : { status: "failed" };
  return signDownload(supabase, "photo-albums", data);
}

// ── Wave 18 — a recap's three photographs, for the home's feed (REQ-UIX-055, DEC-206 §4.55). Add-only. ──────

export interface RecapPhoto {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface RecapPhotos {
  /** Every visible photograph of the session — the recap's «3 صور». */
  count: number;
  /** The newest three, signed. A signature that fails leaves its photograph out; the count stays. */
  photos: RecapPhoto[];
}

const RECAP_PHOTOS = 3;

/**
 * Per session: how many photographs a viewer may see, and the newest three, signed — the recap's strip.
 *
 * `photos_read` (03 §6) is the whole visibility rule, as on the event page; a hidden photograph is left out
 * for staff too, because a recap is what every member sees. There is no thumbnail derivative yet (§4.55), so
 * each sign is the stripped image itself, and three is the ceiling: the signs are one call for every recap,
 * never one per photograph of an album. «Newest» is a display order with `id` as its tiebreak, not «the last
 * row».
 */
export async function getRecapPhotos(locale: string, sessionIds: string[]): Promise<Map<string, RecapPhotos>> {
  const ids = [...new Set(sessionIds)].filter((id) => z.uuid().safeParse(id).success);
  const out = new Map<string, RecapPhotos>();
  if (ids.length === 0) return out;
  const { supabase } = await sessionClient(locale);

  const { data, error } = await supabase
    .from("photos")
    .select("id, session_id, storage_path, width, height, created_at")
    .in("session_id", ids)
    .is("removed_at", null)
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(`photos (recap): ${error.message}`);

  const rows = (data ?? []) as { id: string; session_id: string; storage_path: string; width: number | null; height: number | null }[];
  const newest = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = newest.get(row.session_id) ?? [];
    if (bucket.length < RECAP_PHOTOS) bucket.push(row);
    newest.set(row.session_id, bucket);
    out.set(row.session_id, { count: (out.get(row.session_id)?.count ?? 0) + 1, photos: [] });
  }

  const toSign = [...newest.values()].flat();
  if (toSign.length === 0) return out;
  const { data: signed } = await supabase.storage.from("photos").createSignedUrls(
    toSign.map((row) => row.storage_path),
    3600,
  );
  const urlByPath = new Map((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]));
  for (const [sessionId, bucket] of newest) {
    const photos = bucket
      .map((row) => ({ id: row.id, url: urlByPath.get(row.storage_path) ?? "", width: row.width ?? null, height: row.height ?? null }))
      .filter((p) => p.url !== "");
    out.set(sessionId, { count: out.get(sessionId)?.count ?? 0, photos });
  }
  return out;
}
