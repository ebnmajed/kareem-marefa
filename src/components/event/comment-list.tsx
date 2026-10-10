"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CommentComposer } from "@/components/event/comment-composer";
import { CommentItem } from "@/components/event/comment-item";
import { avatarHref } from "@/components/privacy/avatar-href";
import { subscribeToSessionTopic } from "@/lib/realtime/channel";
import type { CommentAuthor, CommentDTO } from "@/lib/dal/comments";
import type { ReactionSummary } from "@/lib/dal/reactions";

// The live thread — REQ-EVT-002, REQ-EVT-015, DEC-020 (DEC-208: written anew). Painted by the server, so it is
// correct with no socket; kept live by the session topic's `comment` and `reaction_totals` broadcasts.
//
// ★ One level: top-level comments, each with its replies indented under it. A deleted comment with no replies is
// not drawn; with replies it stands as its tombstone, so the thread keeps its shape (REQ-EVT-005).
// ★ A comment that arrives live carries its author's company and whether they present when the widened
// `comments_broadcast()` is on the database (DEC-209); on one that predates it, an author already on the page
// lends what the page knows, and a new author shows their name alone until the next paint.
// ★ No URL from the payload is ever drawn (DEC-099): the avatar is our own copy, through the one resolver.

type Payload = {
  id: string;
  sessionId: string;
  parentId: string | null;
  authorId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorAvatarVersion?: number | string | null;
  /** 0221 (DEC-280): the library key the author holds, beside the version. */
  authorAvatarKey?: string | null;
  authorCompanyName?: string | null;
  authorTeamColor?: string | null;
  authorIsPresenter?: boolean | null;
  body: string;
  mentions: string[] | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

type Totals = { commentId: string | null; sessionId: string | null; totals: Record<string, number> };

function fromPayload(p: Payload, known: Map<string, CommentAuthor>, viewer: string, staff: boolean, windowMs: number | null): CommentDTO {
  const before = known.get(p.authorId);
  const company = p.authorCompanyName !== undefined ? (p.authorCompanyName ? { name: p.authorCompanyName, teamColor: p.authorTeamColor ?? null } : null) : (before?.company ?? null);
  const mine = p.authorId === viewer;
  return {
    id: p.id,
    sessionId: p.sessionId,
    parentId: p.parentId,
    author: {
      id: p.authorId,
      displayName: p.authorDisplayName,
      avatarUrl: avatarHref({ id: p.authorId, avatarVersion: p.authorAvatarVersion, avatarKey: p.authorAvatarKey }),
      company,
      isPresenter: p.authorIsPresenter ?? before?.isPresenter ?? false,
    },
    body: p.body,
    mentions: p.mentions ?? [],
    createdAt: p.createdAt,
    editedAt: p.editedAt,
    deletedAt: p.deletedAt,
    isMine: mine,
    canEditNow: mine && !p.deletedAt && windowMs !== null && Date.now() - Date.parse(p.createdAt) < windowMs,
    isStaffViewer: staff,
  };
}

export function CommentList({
  locale,
  sessionId,
  viewer,
  isStaffViewer,
  editWindowMinutes,
  initialComments,
  initialReactions,
  initialReported,
  frozen,
  now,
  timeZone,
}: {
  locale: string;
  sessionId: string;
  viewer: CommentAuthor;
  isStaffViewer: boolean;
  editWindowMinutes: number | null;
  initialComments: CommentDTO[];
  initialReactions: Record<string, ReactionSummary>;
  initialReported: string[];
  frozen: boolean;
  now: string;
  timeZone: string;
}) {
  const t = useTranslations("event.comments");
  const [comments, setComments] = useState(initialComments);
  const [reactions, setReactions] = useState(initialReactions);
  const [reported, setReported] = useState(() => new Set(initialReported));
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const windowMs = editWindowMinutes != null ? editWindowMinutes * 60_000 : null;

  // A refresh hands fresh props; state follows them (React's «adjust during render», no effect).
  const [seen, setSeen] = useState({ initialComments, initialReactions, initialReported });
  if (seen.initialComments !== initialComments || seen.initialReactions !== initialReactions || seen.initialReported !== initialReported) {
    setSeen({ initialComments, initialReactions, initialReported });
    setComments(initialComments);
    setReactions(initialReactions);
    setReported(new Set(initialReported));
  }

  useEffect(() => {
    return subscribeToSessionTopic(sessionId, (message) => {
      if (message.event === "INSERT" || message.event === "UPDATE") {
        const payload = message.payload as unknown as Payload;
        setComments((prev) => {
          const known = new Map(prev.map((c) => [c.author.id, c.author]));
          const dto = fromPayload(payload, known, viewer.id, isStaffViewer, windowMs);
          const at = prev.findIndex((c) => c.id === dto.id);
          if (at === -1) return [...prev, dto].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const next = prev.slice();
          next[at] = dto;
          return next;
        });
      } else if (message.event === "reaction_totals") {
        const payload = message.payload as unknown as Totals;
        const id = payload.commentId;
        if (!id) return;
        setReactions((prev) => ({ ...prev, [id]: { totals: payload.totals, mine: prev[id]?.mine ?? [] } }));
      }
    });
  }, [sessionId, viewer.id, isStaffViewer, windowMs]);

  const top = comments.filter((c) => c.parentId === null);
  const replies = new Map<string, CommentDTO[]>();
  for (const c of comments) if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
  const none: ReactionSummary = { totals: {}, mine: [] };
  const item = (c: CommentDTO, extra: Partial<Parameters<typeof CommentItem>[0]> = {}) => (
    <CommentItem
      locale={locale}
      comment={c}
      reactions={reactions[c.id] ?? none}
      reported={reported.has(c.id)}
      onReported={() => setReported((prev) => new Set(prev).add(c.id))}
      frozen={frozen}
      now={now}
      timeZone={timeZone}
      {...extra}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {frozen ? (
        <p className="text-body-sm text-fg-muted">{t("frozenOnCancelled")}</p>
      ) : (
        <CommentComposer locale={locale} sessionId={sessionId} parentId={null} viewer={viewer} />
      )}
      {top.length === 0 ? (
        frozen ? null : <p className="text-body text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {top.map((c) => {
            const under = replies.get(c.id) ?? [];
            if (c.deletedAt && under.length === 0) return null;
            return (
              <li key={c.id}>
                {item(c, { onReply: frozen ? undefined : () => setReplyTo((v) => (v === c.id ? null : c.id)), isReplyOpen: replyTo === c.id })}
                {replyTo === c.id ? (
                  <div className="ms-10 mb-2">
                    <CommentComposer locale={locale} sessionId={sessionId} parentId={c.id} onPosted={() => setReplyTo(null)} onCancel={() => setReplyTo(null)} autoFocus />
                  </div>
                ) : null}
                {under.length > 0 ? (
                  <ul className="ms-10 flex flex-col">
                    {under.map((r) => (
                      <li key={r.id}>{item(r)}</li>
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
