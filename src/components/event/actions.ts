"use server";

import { createComment, createCommentInput, deleteOwnComment, moderateComment, searchMentionCandidates, updateComment, updateCommentInput } from "@/lib/dal/comments";
import { toggleReaction } from "@/lib/dal/reactions";
import { reportComment, reportCommentInput } from "@/lib/dal/reports";

// Server Actions for the Comments slot. Every write goes through
// src/lib/dal/comments.ts (Zod first, REQ-NFR-002); nothing here re-derives
// authority — the session's own memberId is the DAL's, never a value read
// off the client.
//
// UI update strategy, stated once here rather than left implicit: these
// actions do NOT return the written row and the client does NOT patch its
// own state by hand. Two things make the result visible instead, for two
// different audiences: the private channel's broadcast (03 §7.4) is what
// everyone ELSE watching the page sees live, and the caller
// (comment-composer.tsx, comment-item.tsx) calls `router.refresh()` after a
// successful action so the ACTOR sees their own result immediately without
// depending on a websocket subscription having finished establishing yet.
// Relying on the broadcast alone for the actor's own copy was tried first
// and found wanting — tests/e2e/event-comments.spec.ts caught a real case
// of a fresh page load racing its own subscribe() against the insert it was
// about to make, leaving the poster looking at an empty composer with
// nothing to show for it. A fresh page load is correct regardless
// (REQ-EVT-015's DEC-020 fallback), since it always reads through
// getCommentsPageData().

export type ActionResult = { error: string | null };

const KNOWN_ERRORS = new Set([
  "reply_depth",
  "not_author",
  "not_permitted",
  "edit_window_closed",
  "invalid_comment",
  "invalid_target",
  "already_reacted",
  "already_rated",
  "window_closed",
]);

function toErrorKey(e: unknown): string {
  const message = e instanceof Error ? e.message : "generic";
  return KNOWN_ERRORS.has(message) ? message : "generic";
}

export async function postCommentAction(locale: string, sessionId: string, parentId: string | null, mentionedMemberIds: string[], body: string): Promise<ActionResult> {
  const parsed = createCommentInput.safeParse({ sessionId, parentId, body, mentionedMemberIds });
  if (!parsed.success) return { error: "invalid_comment" };
  try {
    await createComment(locale, parsed.data);
    return { error: null };
  } catch (e) {
    return { error: toErrorKey(e) };
  }
}

export async function editCommentAction(locale: string, commentId: string, body: string): Promise<ActionResult> {
  const parsed = updateCommentInput.safeParse({ commentId, body });
  if (!parsed.success) return { error: "invalid_comment" };
  try {
    await updateComment(locale, parsed.data);
    return { error: null };
  } catch (e) {
    return { error: toErrorKey(e) };
  }
}

/** The author's own delete, any time (REQ-EVT-005). */
export async function deleteMyCommentAction(locale: string, commentId: string): Promise<ActionResult> {
  try {
    await deleteOwnComment(locale, commentId);
    return { error: null };
  } catch (e) {
    return { error: toErrorKey(e) };
  }
}

/** A moderator/admin's remove or restore. */
export async function moderateCommentAction(locale: string, commentId: string, action: "remove" | "restore"): Promise<ActionResult> {
  try {
    await moderateComment(locale, commentId, action);
    return { error: null };
  } catch (e) {
    return { error: toErrorKey(e) };
  }
}

export async function toggleReactionAction(locale: string, commentId: string, kind: string): Promise<ActionResult> {
  try {
    await toggleReaction(locale, { commentId }, kind);
    return { error: null };
  } catch (e) {
    return { error: toErrorKey(e) };
  }
}

export async function reportCommentAction(locale: string, commentId: string, reason: string): Promise<ActionResult> {
  const parsed = reportCommentInput.safeParse({ commentId, reason });
  if (!parsed.success) return { error: "invalid_comment" };
  try {
    await reportComment(locale, parsed.data);
    return { error: null };
  } catch (e) {
    return { error: toErrorKey(e) };
  }
}

export async function searchMentionsAction(locale: string, query: string) {
  return searchMentionCandidates(locale, query);
}
