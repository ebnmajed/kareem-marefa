"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { subscribeToSessionTopic } from "@/lib/realtime/channel";
import { Panel } from "@/components/ui/panel";
import { CommentComposer } from "@/components/event/comment-composer";
import { CommentItem } from "@/components/event/comment-item";
import type { CommentDTO } from "@/lib/dal/comments";
import type { ReactionSummary } from "@/lib/dal/reactions";

// The live thread (REQ-EVT-015, A18): server-rendered on first paint
// (DEC-020's fallback — correct even if the socket never connects), kept
// live after that by the session topic's comment and reaction_totals
// broadcasts (03 §7.3/§7.4). One level of replies only — the schema has
// nothing deeper to render (REQ-EVT-002).

type CommentBroadcastPayload = {
  id: string;
  sessionId: string;
  parentId: string | null;
  authorId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  mentions: string[] | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

type ReactionTotalsPayload = { commentId: string | null; sessionId: string | null; totals: Record<string, number> };

function fromBroadcast(payload: CommentBroadcastPayload, viewerMemberId: string, isStaffViewer: boolean, editWindowMs: number | null): CommentDTO {
  const isMine = payload.authorId === viewerMemberId;
  const withinWindow = editWindowMs != null && Date.now() - new Date(payload.createdAt).getTime() < editWindowMs;
  return {
    id: payload.id,
    sessionId: payload.sessionId,
    parentId: payload.parentId,
    author: { id: payload.authorId, displayName: payload.authorDisplayName, avatarUrl: payload.authorAvatarUrl },
    body: payload.body,
    mentions: payload.mentions ?? [],
    createdAt: payload.createdAt,
    editedAt: payload.editedAt,
    deletedAt: payload.deletedAt,
    isMine,
    canEditNow: isMine && !payload.deletedAt && withinWindow,
    isStaffViewer,
  };
}

export function CommentList({
  locale,
  sessionId,
  viewerMemberId,
  isStaffViewer,
  editWindowMinutes,
  initialComments,
  initialReactions,
  initialReported,
  frozen,
}: {
  locale: string;
  sessionId: string;
  viewerMemberId: string;
  isStaffViewer: boolean;
  editWindowMinutes: number | null;
  initialComments: CommentDTO[];
  initialReactions: Record<string, ReactionSummary>;
  initialReported: string[];
  /** The session is cancelled — comments are read-only (REQ-SES-010). */
  frozen: boolean;
}) {
  const t = useTranslations("event.comments");
  const [comments, setComments] = useState<CommentDTO[]>(initialComments);
  const [reactions, setReactions] = useState<Record<string, ReactionSummary>>(initialReactions);
  const [reported, setReported] = useState<Set<string>>(new Set(initialReported));
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const editWindowMs = editWindowMinutes != null ? editWindowMinutes * 60_000 : null;

  // ★ `useState(initialComments)` only reads the prop at MOUNT — a real bug,
  // not a defensive guard: `router.refresh()` (comment-composer.tsx,
  // comment-item.tsx) re-runs the server component and passes a fresh
  // `initialComments` array, but an already-mounted client component never
  // re-reads its own useState initializer, so the poster's own new comment
  // never appeared even though the server had it and the count next to the
  // heading updated — the two were rendering from different data. Caught by
  // tests/e2e/event-comments.spec.ts flaking exactly on this composer/list
  // mismatch. Adjusted DURING render (React's own pattern for "reset state
  // when a prop changes", not an effect — an effect here would be a second,
  // visibly-delayed render on every refresh), one prop at a time so a prop
  // that happens to change alone can't leave another's tracker stale.
  const [prevComments, setPrevComments] = useState(initialComments);
  if (prevComments !== initialComments) {
    setPrevComments(initialComments);
    setComments(initialComments);
  }
  const [prevReactions, setPrevReactions] = useState(initialReactions);
  if (prevReactions !== initialReactions) {
    setPrevReactions(initialReactions);
    setReactions(initialReactions);
  }
  const [prevReported, setPrevReported] = useState(initialReported);
  if (prevReported !== initialReported) {
    setPrevReported(initialReported);
    setReported(new Set(initialReported));
  }

  useEffect(() => {
    const unsubscribe = subscribeToSessionTopic(sessionId, (message) => {
      if (message.event === "INSERT" || message.event === "UPDATE") {
        const dto = fromBroadcast(message.payload as unknown as CommentBroadcastPayload, viewerMemberId, isStaffViewer, editWindowMs);
        setComments((prev) => {
          const index = prev.findIndex((c) => c.id === dto.id);
          if (index === -1) return [...prev, dto].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const next = prev.slice();
          next[index] = dto;
          return next;
        });
      } else if (message.event === "reaction_totals") {
        const payload = message.payload as unknown as ReactionTotalsPayload;
        if (!payload.commentId) return;
        setReactions((prev) => ({ ...prev, [payload.commentId as string]: { totals: payload.totals, mine: prev[payload.commentId as string]?.mine ?? [] } }));
      }
    });
    return unsubscribe;
    // editWindowMs is derived from a prop that does not change per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, viewerMemberId, isStaffViewer]);

  const topLevel = comments.filter((c) => c.parentId === null);
  const repliesByParent = new Map<string, CommentDTO[]>();
  for (const c of comments) {
    if (c.parentId) repliesByParent.set(c.parentId, [...(repliesByParent.get(c.parentId) ?? []), c]);
  }

  function visible(comment: CommentDTO, replyCount: number): boolean {
    return !comment.deletedAt || replyCount > 0;
  }

  const emptySummary: ReactionSummary = { totals: {}, mine: [] };

  return (
    <div>
      {frozen ? (
        <Panel tone="neutral">
          <p className="text-body-sm text-fg-muted">{t("frozenOnCancelled")}</p>
        </Panel>
      ) : (
        <div className="mb-4">
          <CommentComposer locale={locale} sessionId={sessionId} parentId={null} />
        </div>
      )}

      {topLevel.length === 0 ? (
        // ★ Not `EmptyState` — the lead's 390 px review of the live build
        // caught this: the composer is ALREADY the visible, primary next
        // action right above this (it is unconditional whenever this branch
        // is reachable at all — frozen+empty never gets here, `Comments()`
        // returns null first), so a SECOND card offering "write the first
        // comment" duplicated the one action into two, and the one that
        // looked primary was not the composer. A quiet sentence, no button.
        frozen ? null : <p className="text-body text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-[var(--edge)]">
          {topLevel.map((comment) => {
            const replies = repliesByParent.get(comment.id) ?? [];
            if (!visible(comment, replies.length)) return null;
            return (
              <li key={comment.id}>
                <CommentItem
                  locale={locale}
                  comment={comment}
                  reactions={reactions[comment.id] ?? emptySummary}
                  reported={reported.has(comment.id)}
                  onReply={frozen ? undefined : () => setOpenReplyFor((v) => (v === comment.id ? null : comment.id))}
                  isReplyOpen={openReplyFor === comment.id}
                  onReported={() => setReported((prev) => new Set(prev).add(comment.id))}
                  frozen={frozen}
                />
                {openReplyFor === comment.id ? (
                  <div className="ms-8 mb-3">
                    <CommentComposer
                      locale={locale}
                      sessionId={sessionId}
                      parentId={comment.id}
                      onPosted={() => setOpenReplyFor(null)}
                      onCancel={() => setOpenReplyFor(null)}
                      autoFocus
                    />
                  </div>
                ) : null}
                {replies.length > 0 ? (
                  <ul className="ms-8 divide-y divide-[var(--edge)] border-s border-[var(--edge)] ps-4">
                    {replies.map((reply) => (
                      <li key={reply.id}>
                        <CommentItem
                          locale={locale}
                          comment={reply}
                          reactions={reactions[reply.id] ?? emptySummary}
                          reported={reported.has(reply.id)}
                          onReported={() => setReported((prev) => new Set(prev).add(reply.id))}
                          frozen={frozen}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
