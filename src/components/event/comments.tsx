import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getCommentsPageData } from "@/lib/dal/comments";
import { getReactionTotalsForComments } from "@/lib/dal/reactions";
import { getReportedCommentIds } from "@/lib/dal/reports";
import { formatNumber } from "@/components/sessions/numerals";
import { CommentList } from "@/components/event/comment-list";

// The `Comments` slot (TEAM.md §2, SCR-012 item 8): threaded comments, one
// level of replies, live (REQ-EVT-001 … REQ-EVT-008, REQ-EVT-015). A server
// component that fetches its own data and hands a plain client component
// the DTOs plus the org's edit-window and numeral settings — nothing here
// receives a row, only what src/lib/dal/comments.ts already shaped.
//
// No <section>/<h2> of its own: the event page already wraps every slot in
// its own landmark and heading (`<section aria-labelledby="comments">`,
// SCR-012's own "التعليقات" copy) — a slot adding a second, identical
// heading inside that section is a real accessibility duplicate, not a
// style choice, caught by tests/e2e/event-comments.spec.ts against the
// real page rather than assumed from the component test alone.
export async function Comments({ sessionId, memberId, locale }: SlotProps) {
  const t = await getTranslations("event.comments");
  const { comments, editWindowMinutes, frozen, isStaffViewer } = await getCommentsPageData(locale, sessionId);

  const [reactions, reportedIds] = await Promise.all([
    getReactionTotalsForComments(locale, comments.map((c) => c.id)),
    getReportedCommentIds(locale, comments.map((c) => c.id)),
  ]);

  const activeCount = comments.filter((c) => !c.deletedAt).length;

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
