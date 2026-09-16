import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Threaded comments — one level of replies (REQ-EVT-002, REQ-EVT-003,
// REQ-EVT-005). The table, its guard trigger and every policy but one
// already exist (migration 0010); this module is the DTO boundary plus the
// one gap that schema can't close on its own — see
// docs/plan/notes/event.md §1 for why a member's own delete past the edit
// window needs supabase/proposed/event/03_comments_self_delete_rpc.sql.
//
// Comment removal WITH an audited reason (REQ-EVT-014) is STORY-EVT-006,
// M5, alongside photo takedown — not built here. A moderator/admin can
// still remove or restore today through the plain update policy
// (p6_staff_update); it just carries no reason or audit row yet.

export interface CommentAuthor {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface CommentDTO {
  id: string;
  sessionId: string;
  parentId: string | null;
  author: CommentAuthor;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  isMine: boolean;
  /** Mine, not deleted, and still inside org_settings.comment_edit_window_minutes. */
  canEditNow: boolean;
  /** admin or moderator — can remove/restore any comment, any time. */
  isStaffViewer: boolean;
}

type CommentRow = {
  id: string;
  session_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  mentions: string[] | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author: { id: string; display_name: string | null; avatar_url: string | null } | null;
};

function mapCommentError(error: { message: string; code?: string }): Error {
  if (/reply_depth/.test(error.message)) return new Error("reply_depth");
  if (/not_author/.test(error.message)) return new Error("not_author");
  if (/immutable_columns/.test(error.message)) return new Error("not_permitted");
  if (error.code === "42501") return new Error("not_permitted");
  return new Error(`comments: ${error.message}`);
}

/**
 * A flat, chronological list. The caller (Comments slot) nests each row
 * under its `parentId` — exactly one level exists in the schema, so there is
 * nothing deeper to recurse into.
 */
export async function listComments(locale: string, sessionId: string): Promise<CommentDTO[]> {
  return (await getCommentsPageData(locale, sessionId)).comments;
}

export interface CommentsPageData {
  comments: CommentDTO[];
  /** null when the org's setting could not be read — treated as "no window" (no self-edit offered), never as unlimited. */
  editWindowMinutes: number | null;
  /** REQ-SES-010 — a cancelled session's comments are read-only. */
  frozen: boolean;
  /** admin or moderator — kept at the top level so an empty thread still knows. */
  isStaffViewer: boolean;
}

/**
 * Everything the `Comments` slot needs, in one round trip: the thread, the
 * org's edit window and numeral setting, and whether the session is
 * cancelled. A slot fetches its own data (TEAM.md §2) — this is that fetch.
 */
export async function getCommentsPageData(locale: string, sessionId: string): Promise<CommentsPageData> {
  if (!z.uuid().safeParse(sessionId).success) {
    return { comments: [], editWindowMinutes: null, frozen: false, isStaffViewer: false };
  }
  const { session, supabase } = await sessionClient(locale);

  const [{ data, error }, { data: settings }, { data: sessionRow }] = await Promise.all([
    supabase
      .from("comments")
      .select(
        "id, session_id, parent_id, author_id, body, mentions, created_at, edited_at, deleted_at, " +
          "author:members!comments_author_id_fkey(id, display_name, avatar_url)",
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
    supabase.from("org_settings").select("comment_edit_window_minutes").eq("org_id", session.orgId).maybeSingle(),
    supabase.from("sessions").select("state").eq("id", sessionId).maybeSingle(),
  ]);
  if (error) throw new Error(`comments: ${error.message}`);

  const editWindowMinutes = settings?.comment_edit_window_minutes ?? null;
  const editWindowMs = editWindowMinutes != null ? editWindowMinutes * 60_000 : null;
  const isStaff = session.role === "admin" || session.role === "moderator";
  const now = Date.now();

  const comments = ((data ?? []) as unknown as CommentRow[]).map((r) => {
    const isMine = r.author_id === session.memberId;
    const withinWindow = editWindowMs != null && now - new Date(r.created_at).getTime() < editWindowMs;
    return {
      id: r.id,
      sessionId: r.session_id,
      parentId: r.parent_id,
      author: { id: r.author?.id ?? r.author_id, displayName: r.author?.display_name ?? null, avatarUrl: r.author?.avatar_url ?? null },
      body: r.body,
      mentions: r.mentions ?? [],
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
      isMine,
      canEditNow: isMine && !r.deleted_at && withinWindow,
      isStaffViewer: isStaff,
    };
  });

  return {
    comments,
    editWindowMinutes,
    frozen: sessionRow?.state === "cancelled",
    isStaffViewer: isStaff,
  };
}

export const createCommentInput = z.object({
  sessionId: z.uuid(),
  parentId: z.uuid().nullable(),
  body: z.string().trim().min(1).max(4000),
  /** Resolved org-member ids, from @mention search over members_member_view
   *  (REQ-EVT-006) — delivery (a notification row) is M3's `notify`; this
   *  only records who was named. */
  mentionedMemberIds: z.array(z.uuid()).max(20).default([]),
});
export type CreateCommentInput = z.infer<typeof createCommentInput>;

export async function createComment(locale: string, input: CreateCommentInput): Promise<string> {
  const { session, supabase } = await sessionClient(locale);
  const mentions = Array.from(new Set(input.mentionedMemberIds.filter((id) => id !== session.memberId)));
  const { data, error } = await supabase
    .from("comments")
    .insert({
      org_id: session.orgId,
      session_id: input.sessionId,
      author_id: session.memberId,
      parent_id: input.parentId,
      body: input.body,
      mentions,
    })
    .select("id")
    .single();
  if (error) throw mapCommentError(error);
  return data.id as string;
}

export const updateCommentInput = z.object({ commentId: z.uuid(), body: z.string().trim().min(1).max(4000) });
export type UpdateCommentInput = z.infer<typeof updateCommentInput>;

/** The author's own edit, inside the window — the column grant refuses body
 *  to anyone else, and comments_guard() stamps edited_at. */
export async function updateComment(locale: string, input: UpdateCommentInput): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("comments").update({ body: input.body }).eq("id", input.commentId).select("id");
  if (error) throw mapCommentError(error);
  if (!data || data.length === 0) throw new Error("edit_window_closed");
}

/** The author's own delete, at ANY time (REQ-EVT-005) — see the module note. */
export async function deleteOwnComment(locale: string, commentId: string): Promise<void> {
  if (!z.uuid().safeParse(commentId).success) throw new Error("invalid_comment");
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("delete_own_comment", { p_comment: commentId });
  if (error) throw mapCommentError(error);
}

export interface MentionCandidate {
  id: string;
  displayName: string | null;
}

/**
 * @-mention search (REQ-EVT-006): "mention search returns only members of
 * the same org" is structural here, not a filter this function adds —
 * `members_member_view` is already org-scoped by its own RLS
 * (`members_read_org`, `security_invoker = true`), so a query against it
 * cannot return another org's member no matter what `query` is.
 */
export async function searchMentionCandidates(locale: string, query: string): Promise<MentionCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("members_member_view")
    .select("id, display_name")
    .neq("id", session.memberId)
    .ilike("display_name", `%${trimmed}%`)
    .order("display_name")
    .limit(8);
  if (error) throw new Error(`members_member_view: ${error.message}`);
  return (data ?? []).map((m) => ({ id: m.id, displayName: m.display_name }));
}

/** A moderator/admin's removal — direct update, unrestricted by time (p6_staff_update). */
export async function moderateComment(locale: string, commentId: string, action: "remove" | "restore"): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("comments")
    .update({ deleted_at: action === "remove" ? new Date().toISOString() : null })
    .eq("id", commentId)
    .select("id");
  if (error) throw mapCommentError(error);
  if (!data || data.length === 0) throw new Error("not_permitted");
}
