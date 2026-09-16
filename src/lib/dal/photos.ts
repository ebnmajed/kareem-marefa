import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { photoPath } from "@/lib/storage/paths";

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
}

export interface PhotosPageData {
  photos: PhotoSummary[];
  /** REQ-EVT-009 — a UI hint only; `photos_storage_write` is the real gate regardless of what this says. */
  canUpload: boolean;
  isStaff: boolean;
  myMemberId: string;
}

/** The event page's `Photos` slot — REQ-EVT-010: `photos_read`'s own `hidden_at is null or
 *  is_staff()` clause (03 §6) is the entire visibility rule; this never adds a second filter
 *  on top of it, so a plain member's query already excludes hidden photos server-side. */
export async function getPhotosPageData(locale: string, sessionId: string): Promise<PhotosPageData> {
  if (!z.uuid().safeParse(sessionId).success) return { photos: [], canUpload: false, isStaff: false, myMemberId: "" };
  const { session, supabase } = await sessionClient(locale);

  const [{ data: rows, error }, { data: checkedIn }, { data: presents }] = await Promise.all([
    supabase.from("photos").select("id, uploader_id, storage_path, created_at, hidden_at").eq("session_id", sessionId).is("removed_at", null).order("created_at", { ascending: false }),
    supabase.rpc("has_checked_in", { p_session: sessionId }),
    supabase.rpc("is_presenter_of", { p_session: sessionId }),
  ]);
  if (error) throw new Error(`photos: ${error.message}`);

  const photos = await Promise.all(
    (rows ?? []).map(async (p): Promise<PhotoSummary> => {
      const { data: signed } = await supabase.storage.from("photos").createSignedUrl(p.storage_path as string, 3600);
      return { id: p.id as string, uploaderId: p.uploader_id as string, createdAt: p.created_at as string, url: signed?.signedUrl ?? "", hiddenAt: (p.hidden_at as string | null) ?? null };
    }),
  );

  const isStaff = session.role === "admin" || session.role === "moderator";
  return {
    photos,
    canUpload: !!checkedIn || !!presents || isStaff,
    isStaff,
    myMemberId: session.memberId,
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
