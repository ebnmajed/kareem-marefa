import "server-only";
import { z } from "zod";
import { avatarPath, type AvatarSize } from "@/lib/storage/paths";
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
