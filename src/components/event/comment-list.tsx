"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CommentComposer } from "@/components/event/comment-composer";
import { CommentItem } from "@/components/event/comment-item";
import { avatarHref } from "@/components/privacy/avatar-href";
import { formatNumber } from "@/components/sessions/numerals";
import { useToast } from "@/components/ui/toast";
import { isPending, queueReaction } from "@/lib/reactions/queue";
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
// ★ DEC-290 — THE LIKE IS THIS LIST'S STATE. A tap changes it at once and queues the desired state
// (`lib/reactions/queue.ts`); nothing refreshes the page. A live total for a comment whose write is still waiting is
// not the member's yet, so it is not applied over their tap; a failed write puts back what the server held.
// ★ DEC-290 — REPLIES, THE INSTAGRAM WAY. «رد» on every comment and every reply. Replying to a reply posts under the
// thread's first comment (REQ-EVT-002 — `comments_guard` refuses a third level) with «@name» written and that member
// mentioned. A thread of more than two replies shows its first two and «عرض N ردود» for the rest.

const SHOWN_REPLIES = 2;
type ReplyTarget = { thread: string; mention: { id: string; name: string } | null };

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
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toast = useToast();
  // What the server held before a comment's first unsent tap — put back if the write fails.
  const baseline = useRef(new Map<string, ReactionSummary>());
  const windowMs = editWindowMinutes != null ? editWindowMinutes * 60_000 : null;

  function like(commentId: string, next: boolean) {
    const none: ReactionSummary = { totals: {}, mine: [] };
    setReactions((prev) => {
      const before = prev[commentId] ?? none;
      if (!baseline.current.has(commentId)) baseline.current.set(commentId, before);
      const had = before.mine.includes("like");
      if (had === next) return prev;
      const count = Math.max(0, (before.totals.like ?? 0) + (next ? 1 : -1));
      const mine = next ? [...before.mine, "like"] : before.mine.filter((k) => k !== "like");
      return { ...prev, [commentId]: { totals: { ...before.totals, like: count }, mine } };
    });
    queueReaction({ target: "comment", id: commentId, kind: "like", on: next }, (result) => {
      const held = baseline.current.get(commentId);
      baseline.current.delete(commentId);
      if (result.ok || !held) return;
      setReactions((prev) => ({ ...prev, [commentId]: held }));
      toast.show({ tone: "error", title: t("toasts.reactionFailed") });
    });
  }

  // A refresh hands fresh props; state follows them (React's «adjust during render», no effect).
  const [seen, setSeen] = useState({ initialComments, initialReactions, initialReported });
  if (seen.initialComments !== initialComments || seen.initialReactions !== initialReactions || seen.initialReported !== initialReported) {
    setSeen({ initialComments, initialReactions, initialReported });
    setComments(initialComments);
    // A like still on its way stays as tapped: the fresh paint may predate it (DEC-290).
    const kept = { ...initialReactions };
    for (const id of Object.keys(reactions)) if (isPending("comment", id)) kept[id] = reactions[id];
    setReactions(kept);
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
        // The member's own tap is still on its way: this total is not theirs yet (DEC-290).
        if (!id || isPending("comment", id)) return;
        setReactions((prev) => ({ ...prev, [id]: { totals: payload.totals, mine: prev[id]?.mine ?? [] } }));
      }
    });
  }, [sessionId, viewer.id, isStaffViewer, windowMs]);

  const top = comments.filter((c) => c.parentId === null);
  const replies = new Map<string, CommentDTO[]>();
  for (const c of comments) if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
  const none: ReactionSummary = { totals: {}, mine: [] };
  // The reply a comment opens: under its thread's first comment, naming its author when it is a reply and not the
  // viewer's own (the first comment's author hears of a reply through `comment_reply` already).
  const targetOf = (c: CommentDTO): ReplyTarget => ({
    thread: c.parentId ?? c.id,
    mention: c.parentId && c.author.id !== viewer.id && c.author.displayName ? { id: c.author.id, name: c.author.displayName } : null,
  });
  const sameTarget = (a: ReplyTarget | null, b: ReplyTarget) => a !== null && a.thread === b.thread && (a.mention?.id ?? null) === (b.mention?.id ?? null);
  const item = (c: CommentDTO) => {
    const target = targetOf(c);
    return (
      <CommentItem
        locale={locale}
        comment={c}
        reactions={reactions[c.id] ?? none}
        onLike={(next) => like(c.id, next)}
        reported={reported.has(c.id)}
        onReported={() => setReported((prev) => new Set(prev).add(c.id))}
        onReply={frozen ? undefined : () => setReplyTo((v) => (sameTarget(v, target) ? null : target))}
        isReplyOpen={sameTarget(replyTo, target)}
        frozen={frozen}
        now={now}
        timeZone={timeZone}
      />
    );
  };

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
            const open = expanded.has(c.id) || under.length <= SHOWN_REPLIES;
            const shown = open ? under : under.slice(0, SHOWN_REPLIES);
            const hidden = under.length - shown.length;
            const composing = !frozen && replyTo?.thread === c.id ? replyTo : null;
            return (
              <li key={c.id}>
                {item(c)}
                {under.length > 0 ? (
                  <ul className="ms-10 flex flex-col">
                    {shown.map((r) => (
                      <li key={r.id}>{item(r)}</li>
                    ))}
                  </ul>
                ) : null}
                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => new Set(prev).add(c.id))}
                    aria-expanded={false}
                    className="ms-10 mb-2 inline-flex min-h-11 items-center gap-2 rounded-pill px-2 text-caption font-bold text-fg-muted hover:text-fg-heading"
                  >
                    <span aria-hidden className="h-px w-6 bg-edge-strong" />
                    {t("showReplies", { count: hidden, value: formatNumber(hidden) })}
                  </button>
                ) : null}
                {composing ? (
                  <div className="ms-10 mb-2">
                    <CommentComposer
                      key={`${composing.thread}:${composing.mention?.id ?? ""}`}
                      locale={locale}
                      sessionId={sessionId}
                      parentId={c.id}
                      mention={composing.mention}
                      onPosted={() => {
                        setReplyTo(null);
                        // The member sees the reply they just posted, wherever it falls in the thread.
                        setExpanded((prev) => new Set(prev).add(c.id));
                      }}
                      onCancel={() => setReplyTo(null)}
                      autoFocus
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
