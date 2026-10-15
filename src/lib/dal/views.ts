import "server-only";
import { z } from "zod";
import { avatarHref } from "@/components/privacy/avatar-href";
import { getSessionState, sessionClient } from "@/lib/dal/session";
import { createServerClient } from "@/lib/supabase/server";

// Views — the record and every read (REQ-VEW-001 … 004, REQ-STO-010 as amended, DEC-297; notes/views.md).
//
// Three doors, each a definer function (supabase/proposed/content/02_views.sql → 0228): `record_views()` writes,
// `view_counts()` and `view_list()` read. No client role reads another member's view row, staff included, so this
// module never selects `story_views` or `content_views` for a count — the functions re-derive visibility and ownership
// and this module only shapes their answers. Checks here are shape (CLAUDE.md «Validation»).

export const VIEW_KINDS = ["frame", "post", "recap", "announcement"] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

/** REQ-VEW-003 — null (or a missing key) when nobody else has viewed: a count is never drawn at 0. */
export interface ViewCount {
  /** Unique viewers (reach), owners and anonymised members excluded. ≥ 1. */
  count: number;
  /** The caller may open the list (REQ-VEW-004): an owner of the subject, or an admin/moderator. */
  canList: boolean;
}

export interface Viewer {
  memberId: string;
  name: string;
  avatarHref: string | null;
  /** "YYYY-MM-DD" on the org's calendar — never a time finer than the day (REQ-VEW-004). */
  day: string;
}

export interface ViewerList {
  /** Newest first by the last time seen; at most 200. */
  viewers: Viewer[];
  /** The whole reach. */
  total: number;
}

/** A batch from the device (REQ-VEW-006): 1 – 50 entries. */
export const MAX_VIEWS_PER_BATCH = 50;
export const recordViewsInput = z
  .object({
    views: z
      .array(z.object({ kind: z.enum(VIEW_KINDS), id: z.uuid(), completed: z.boolean().optional() }).strict())
      .min(1)
      .max(MAX_VIEWS_PER_BATCH),
  })
  .strict();
export type RecordViewsInput = z.infer<typeof recordViewsInput>;

/** One entry per subject — a repeated `(kind, id)` counts once, and `completed: true` wins. */
export function collapseViews(views: RecordViewsInput["views"]): RecordViewsInput["views"] {
  const byKey = new Map<string, RecordViewsInput["views"][number]>();
  for (const v of views) {
    const key = `${v.kind}:${v.id.toLowerCase()}`;
    const held = byKey.get(key);
    byKey.set(key, held ? { ...held, completed: held.completed || v.completed || undefined } : v);
  }
  return [...byKey.values()].map((v) => (v.completed ? { kind: v.kind, id: v.id, completed: true } : { kind: v.kind, id: v.id }));
}

/** Whether a member session is present — the beacon route answers 401 instead of following `requireSession()`'s
 *  redirect (a beacon cannot follow one). */
export async function hasMemberSession(): Promise<boolean> {
  return (await getSessionState()).kind === "member";
}

/** REQ-VEW-001, 002 — hands the batch to `record_views()`, which skips silently what the caller may not see and
 *  everything inside an impersonation session. Returns how many it recorded (the route does not say). */
export async function recordViews(input: RecordViewsInput): Promise<number> {
  const parsed = recordViewsInput.parse(input);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("record_views", { p_views: collapseViews(parsed.views) });
  if (error) throw new Error(`record_views: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/** REQ-VEW-003 — reach for many subjects of one kind at once: one call, never one per subject. A subject the caller
 *  may not see, or that nobody else viewed, is absent from the map. */
export async function getViewCounts(locale: string, kind: ViewKind, ids: readonly string[]): Promise<Record<string, ViewCount>> {
  const unique = [...new Set(ids)].filter((id) => z.uuid().safeParse(id).success);
  if (unique.length === 0) return {};
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("view_counts", { p_kind: kind, p_ids: unique });
  if (error) throw new Error(`view_counts: ${error.message}`);
  const out: Record<string, ViewCount> = {};
  for (const r of (data ?? []) as { subject_id: string; viewers: number; can_list: boolean }[]) {
    if (r.viewers > 0) out[r.subject_id] = { count: r.viewers, canList: r.can_list };
  }
  return out;
}

/** REQ-VEW-004 — who viewed one subject: its owners and staff only; null for anyone else, a subject the caller cannot
 *  see, or one that does not exist (one answer for all three — the route's 404). */
export async function getViewerList(locale: string, kind: ViewKind, id: string): Promise<ViewerList | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("view_list", { p_kind: kind, p_id: id });
  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`view_list: ${error.message}`);
  }
  const rows = (data ?? []) as {
    member_id: string;
    display_name: string | null;
    avatar_key: string | null;
    avatar_version: number | string | null;
    seen_on: string;
    total: number;
  }[];
  return {
    viewers: rows.map((r) => ({
      memberId: r.member_id,
      name: r.display_name ?? "",
      avatarHref: avatarHref({ id: r.member_id, avatarVersion: r.avatar_version, avatarKey: r.avatar_key }),
      day: r.seen_on,
    })),
    total: rows[0]?.total ?? 0,
  };
}
