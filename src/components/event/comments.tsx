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
export async function Comments({ sessionId, memberId, locale }: SlotProps) {
  const t = await getTranslations("event.comments");
  const { comments, editWindowMinutes, numerals, frozen, isStaffViewer } = await getCommentsPageData(locale, sessionId);

  const [reactions, reportedIds] = await Promise.all([
    getReactionTotalsForComments(locale, comments.map((c) => c.id)),
    getReportedCommentIds(locale, comments.map((c) => c.id)),
  ]);

  const activeCount = comments.filter((c) => !c.deletedAt).length;

  return (
    <section aria-labelledby="event-comments-heading">
      <h2 id="event-comments-heading" className="text-h2 text-fg-heading">
        {t("heading")}
        {activeCount > 0 ? ` · ${t("count", { count: activeCount, value: formatNumber(activeCount, numerals) })}` : ""}
      </h2>
      <div className="mt-4">
        <CommentList
          locale={locale}
          sessionId={sessionId}
          viewerMemberId={memberId}
          isStaffViewer={isStaffViewer}
          editWindowMinutes={editWindowMinutes}
          numerals={numerals}
          initialComments={comments}
          initialReactions={reactions}
          initialReported={Array.from(reportedIds)}
          frozen={frozen}
        />
      </div>
    </section>
  );
}
