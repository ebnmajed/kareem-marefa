import "server-only";
import { z } from "zod";
import { avatarPath, avatarStagingPath, type AvatarSize } from "@/lib/storage/paths";
import { isAvatarKey, type AvatarKey } from "@/lib/avatar-library";
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES, AVATAR_UPLOAD_STATES, type AvatarUploadState } from "@/lib/avatar-upload";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionState, sessionClient } from "@/lib/dal/session";
import { avatarHref } from "@/components/privacy/avatar-href";

// A member's picture — our copy, never Google's (DEC-099, DEC-180 §3, DEC-182;
// REQ-PRF-008, REQ-PRF-009, REQ-PRF-011). Contract 4's server side.
//
// ★ `members.avatar_url` IS NEVER READ HERE. It is Google's source, refreshed on
// every sign-in (0005:124) and kept only so `JOB-import_avatar` knows what to
// copy. What a browser gets is `avatarHref()`'s same-origin path, built from
// `members.avatar_version`, which is non-null only while a copy exists that
// `avatars_storage_read` (0157) will serve.

export { avatarHref, type AvatarSize, type AvatarMember } from "@/components/privacy/avatar-href";

export type AvatarAnswer = "accepted" | "declined";

export interface MyAvatar {
  /** The answer to «نستخدم صورتك من Google؟» — null while the member has not answered. */
  answer: AvatarAnswer | null;
  /** Whether Google gave us anything to copy. No source, no prompt. */
  hasSource: boolean;
  /** Our copy at 192 px (drawn at 96 on the privacy page), or null for initials. */
  href: string | null;
}

const myAvatarRow = z.object({
  answer: z.enum(["accepted", "declined"]).nullable(),
  has_source: z.boolean(),
  version: z.union([z.number(), z.string()]).nullable(),
});

/** The member's own state, through `my_avatar()` — `avatar_import` is in no client grant. */
export async function getMyAvatar(locale: string): Promise<MyAvatar> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("my_avatar");
  const parsed = myAvatarRow.safeParse(data);
  // An unreadable answer is «nothing to offer»: the prompt stays away and the
  // initials stay up, which is the permanent fallback anyway (REQ-PRF-009).
  if (error || !parsed.success) return { answer: null, hasSource: false, href: null };
  return {
    answer: parsed.data.answer,
    hasSource: parsed.data.has_source,
    href: avatarHref({ id: session.memberId, avatarVersion: parsed.data.version }, 192),
  };
}

export type AvatarImportResult = { status: "ok" } | { status: "no_source" } | { status: "failed" };

const answer = z.enum(["accepted", "declined"]);

/**
 * The member answers, or changes their mind (`/app/me/privacy`). The RPC
 * re-derives the member from the session, writes the answer, clears the copy's
 * version on a decline IN THE SAME STATEMENT — so the read stops at once — and
 * enqueues the job that makes storage match.
 */
export async function setMyAvatarImport(locale: string, value: unknown): Promise<AvatarImportResult> {
  const parsed = answer.safeParse(value);
  if (!parsed.success) return { status: "failed" };
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("set_avatar_import", { p_answer: parsed.data });
  if (error) return { status: "failed" };
  return (data as { status?: string } | null)?.status === "no_source" ? { status: "no_source" } : { status: "ok" };
}

export interface AvatarBytes {
  bytes: ArrayBuffer;
  /** Whether the requested version is the current one — the route caches only then. */
  current: boolean;
}

const avatarRequest = z.object({
  memberId: z.uuid(),
  version: z.string().regex(/^[1-9][0-9]{0,15}$/),
  size: z.union([z.literal(96), z.literal(192)]),
});

/**
 * The bytes `/api/avatars/[memberId]` proxies, read AS THE VIEWER.
 *
 * ★ `getSessionState()`, not `requireSession()`: this answers an `<img>`, and a
 * redirect to `/sign-in` would be a broken frame. Every refusal — no session, a
 * platform admin with no member row (DEC-057), another org's member (invisible
 * under `members_read_org`), no copy, a malformed id — is the same `null`, and
 * the route turns every one into the same 404.
 *
 * A stale `v` (a copy replaced while a page was open) serves the current copy,
 * uncached, rather than 404ing into an empty frame.
 */
export async function readAvatar(memberId: string, version: string, size: number): Promise<AvatarBytes | null> {
  const parsed = avatarRequest.safeParse({ memberId, version, size });
  if (!parsed.success) return null;
  const state = await getSessionState();
  if (state.kind !== "member") return null;

  const supabase = await createServerClient();
  const { data, error } = await supabase.from("members").select("org_id, avatar_version").eq("id", parsed.data.memberId).maybeSingle();
  if (error || !data || data.avatar_version === null || data.avatar_version === undefined) return null;

  const current = String(data.avatar_version);
  let location;
  try {
    location = avatarPath(data.org_id as string, parsed.data.memberId, current, parsed.data.size as AvatarSize);
  } catch {
    return null;
  }
  // The policy re-checks the org AND that this is the current version.
  const { data: file, error: downloadError } = await supabase.storage.from(location.bucket).download(location.path);
  if (downloadError || !file) return null;
  return { bytes: await file.arrayBuffer(), current: current === parsed.data.version };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Wave 29 — the sheet «صورتك» (DEC-280 §2 – §4, DEC-281; REQ-PRF-016 … REQ-PRF-019). Contract 3: `content` calls the
// three writes from its Server Actions on «حفظ», reads the sheet with `getAvatarSheet()`, and sends the upload to
// the two routes from the browser. Nothing here touches Storage but the upload's one write, as the member.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export type { AvatarKey } from "@/lib/avatar-library";
export type { AvatarUploadState } from "@/lib/avatar-upload";
export type AvatarPhotoSource = "google" | "upload";

export interface AvatarSheet {
  /** `avatarHref(…, 192)`: photo → library → null. */
  href: string | null;
  /** The library avatar held — outlined in the grid when no photo is current. */
  key: AvatarKey | null;
  /** Which photo is current; null when the library avatar shows — then «أزل الصورة» is absent. */
  source: AvatarPhotoSource | null;
  /** Google gave a picture — then «من Google» is present. */
  googleAvailable: boolean;
}

export type AvatarWriteResult =
  | { status: "ok"; sheet: AvatarSheet }
  | { status: "invalid_key" | "no_photo" | "no_source" | "failed" };

const sheetRow = z.object({
  has_source: z.boolean(),
  version: z.union([z.number(), z.string()]).nullable(),
  key: z.string().nullable().optional(),
  source: z.enum(["google", "upload"]).nullable().optional(),
});

const EMPTY_SHEET: AvatarSheet = { href: null, key: null, source: null, googleAvailable: false };

function toSheet(memberId: string, data: unknown): AvatarSheet | null {
  const parsed = sheetRow.safeParse(data);
  if (!parsed.success) return null;
  const key = isAvatarKey(parsed.data.key) ? parsed.data.key : null;
  return {
    href: avatarHref({ id: memberId, avatarVersion: parsed.data.version, avatarKey: key }, 192),
    key,
    source: parsed.data.version === null ? null : (parsed.data.source ?? "google"),
    googleAvailable: parsed.data.has_source,
  };
}

/** The sheet's state, through `my_avatar()`. Unreadable is «nothing to offer» — the ring keeps what the page drew. */
export async function getAvatarSheet(locale: string): Promise<AvatarSheet> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("my_avatar");
  if (error) return EMPTY_SHEET;
  return toSheet(session.memberId, data) ?? EMPTY_SHEET;
}

const WRITE_STATUSES = new Set(["ok", "invalid_key", "no_photo", "no_source"]);

/** One RPC, one transaction (DEC-280 §2); on `ok`, the sheet as it now stands so the ring updates without a refetch. */
async function sheetWrite(locale: string, fn: string, args?: Record<string, unknown>): Promise<AvatarWriteResult> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc(fn, args);
  const status = (data as { status?: string } | null)?.status;
  if (error || !status || !WRITE_STATUSES.has(status)) return { status: "failed" };
  if (status !== "ok") return { status: status as "invalid_key" | "no_photo" | "no_source" };
  const read = await supabase.rpc("my_avatar");
  const sheet = read.error ? null : toSheet(session.memberId, read.data);
  return sheet ? { status: "ok", sheet } : { status: "failed" };
}

/** A library avatar, picked — any photo goes with it (`set_avatar_library()`). */
export async function pickAvatarKey(locale: string, key: unknown): Promise<AvatarWriteResult> {
  if (!isAvatarKey(key)) return { status: "invalid_key" };
  return sheetWrite(locale, "set_avatar_library", { p_key: key });
}

/** «أزل الصورة» — immediate, no confirm; the key the member holds shows (`remove_avatar_photo()`). */
export async function removeAvatarPhoto(locale: string): Promise<AvatarWriteResult> {
  return sheetWrite(locale, "remove_avatar_photo");
}

/** «من Google» — `ok` while the copy is being made: the current picture stays until the version moves. */
export async function requestAvatarGoogle(locale: string): Promise<AvatarWriteResult> {
  return sheetWrite(locale, "request_avatar_google");
}

export type AvatarUploadResult =
  | { status: "accepted"; uploadId: string }
  | { status: "png_jpg_only" | "too_large" | "unauthorised" | "failed" };

const uploadHeaders = z.object({
  contentType: z.enum(UPLOAD_CONTENT_TYPES),
  contentLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

/** The body, counted as it streams: a lying `content-length` is cut one byte past the cap. */
async function readCapped(body: ReadableStream<Uint8Array>): Promise<Uint8Array | "too_large"> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UPLOAD_BYTES) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * `POST /api/avatars/upload`'s work. The declared type and size are refused before Storage; ★ the content is NOT
 * sniffed here — `REQ-PRF-017` wants an SVG renamed `.png` refused after the bytes land, by the worker. The bytes are
 * written AS THE MEMBER under their own staging prefix (`avatar_staging_insert`, 0222 — no `service_role` on Vercel),
 * then `begin_avatar_upload()` records the upload and enqueues the job. The client never names a path.
 *
 * ★ `getSessionState()`, not `requireSession()`: a fetch gets a status, never a redirect to /sign-in.
 */
export async function uploadAvatar(
  body: ReadableStream<Uint8Array> | null,
  contentType: string | null,
  contentLength: string | null,
): Promise<AvatarUploadResult> {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!(UPLOAD_CONTENT_TYPES as readonly string[]).includes(type)) return { status: "png_jpg_only" };
  const parsed = uploadHeaders.safeParse({ contentType: type, contentLength: contentLength === null ? NaN : Number(contentLength) });
  if (!parsed.success) return { status: "too_large" };
  if (!body) return { status: "failed" };

  const state = await getSessionState();
  if (state.kind !== "member") return { status: "unauthorised" };

  const bytes = await readCapped(body);
  if (bytes === "too_large") return { status: "too_large" };
  if (bytes.byteLength === 0) return { status: "failed" };

  const uploadId = crypto.randomUUID();
  const location = avatarStagingPath(state.session.orgId, state.session.memberId, uploadId);
  const supabase = await createServerClient();
  const { error: storageError } = await supabase.storage
    .from(location.bucket)
    .upload(location.path, bytes, { contentType: parsed.data.contentType, upsert: false });
  if (storageError) return { status: "failed" };

  const { data, error } = await supabase.rpc("begin_avatar_upload", { p_upload: uploadId });
  if (error || (data as { status?: string } | null)?.status !== "ok") return { status: "failed" };
  return { status: "accepted", uploadId };
}

const uploadRow = z.object({
  state: z.enum(AVATAR_UPLOAD_STATES),
  version: z.union([z.number(), z.string()]).nullable(),
  key: z.string().nullable(),
});

/**
 * `GET /api/avatars/upload/{id}`'s work — the caller's own upload by its id, through `my_avatar_upload()`. `null` for
 * anything else (another member's id, an unknown one, no session): the route turns every one into the same 404.
 */
export async function readAvatarUpload(uploadId: string): Promise<{ state: AvatarUploadState; href: string | null } | null> {
  if (!z.uuid().safeParse(uploadId).success) return null;
  const state = await getSessionState();
  if (state.kind !== "member") return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("my_avatar_upload", { p_upload: uploadId });
  const parsed = uploadRow.safeParse(data);
  if (error || !parsed.success) return null;
  const href =
    parsed.data.state === "done"
      ? avatarHref({ id: state.session.memberId, avatarVersion: parsed.data.version, avatarKey: isAvatarKey(parsed.data.key) ? parsed.data.key : null }, 192)
      : null;
  return { state: parsed.data.state, href };
}
