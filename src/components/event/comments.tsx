import { getTranslations } from "next-intl/server";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getCommentsPageData } from "@/lib/dal/comments";
import { getReactionTotalsForComments } from "@/lib/dal/reactions";
import { getReportedCommentIds } from "@/lib/dal/reports";
import { formatNumber } from "@/components/sessions/numerals";
import { CommentList } from "@/components/event/comment-list";

// The `Comments` slot — the discussion, `REQ-UIX-024` (`REQ-EVT-001` …
// `REQ-EVT-008`, `REQ-EVT-015`, live). A server component that fetches its
// own data and hands a plain client component the DTOs plus the org's
// edit-window setting — nothing here receives a row, only what
// src/lib/dal/comments.ts already shaped.
//
// No <section>/<h2> of its own: the event page owns the landmark and the
// heading («النقاش», `id="discussion"` — `sessions.md` §22.2). A slot that
// can render nothing must have its whole section gated WITH it (`16`
// §5.4.1a(b)) — that gate is `commentsSummary()` below, sharing this same
// cache()d read, and this component's own `null` return (the empty,
// non-frozen thread still renders — REQ-EVT-003, any member may post at any
// time) mirrors it exactly, per `sessions.md` §22.4's invariant.
export async function Comments({ sessionId, memberId, locale }: SlotProps) {
  const { comments, editWindowMinutes, frozen, isStaffViewer } = await getCommentsPageData(locale, sessionId);
  const activeCount = comments.filter((c) => !c.deletedAt).length;

  // Frozen (the session was cancelled, REQ-SES-010) AND nothing was ever
  // posted: there is nothing to read and no composer worth showing over a
  // "comments are closed" notice with no comments under it.
  if (activeCount === 0 && frozen) return null;

  const t = await getTranslations("event.comments");
  const [reactions, reportedIds] = await Promise.all([
    getReactionTotalsForComments(locale, comments.map((c) => c.id)),
    getReportedCommentIds(locale, comments.map((c) => c.id)),
  ]);

  return (
    <div>
      {activeCount > 0 ? <p className="text-body-sm text-fg-muted">{t("count", { count: activeCount, value: formatNumber(activeCount) })}</p> : null}
      <div className="mt-4">
        <CommentList
          locale={locale}
          sessionId={sessionId}
          viewerMemberId={memberId}
          isStaffViewer={isStaffViewer}
          editWindowMinutes={editWindowMinutes}
          initialComments={comments}
          initialReactions={reactions}
          initialReported={Array.from(reportedIds)}
          frozen={frozen}
        />
      </div>
    </div>
  );
}

/**
 * `sessions.md` §22.3's `SlotSummaryReader` — the page gates the discussion
 * `<section>` and its `<h2>` («النقاش») on this before rendering `Comments`
 * at all. Shares `getCommentsPageData`'s `cache()`d read (§22.4 R-C3), so
 * this costs no second round trip. `visible === false` exactly when
 * `Comments` returns `null` above — the same two-value test, proven in
 * `tests/components/event/comments.test.tsx`.
 */
export async function commentsSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { comments, frozen } = await getCommentsPageData(locale, sessionId);
  const activeCount = comments.filter((c) => !c.deletedAt).length;
  return { visible: activeCount > 0 || !frozen, count: activeCount, outstanding: null };
}
