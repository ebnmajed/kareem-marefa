import { CommentList } from "@/components/event/comment-list";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getCommentsPageData } from "@/lib/dal/comments";
import { getReactionTotalsForComments } from "@/lib/dal/reactions";
import { getReportedCommentIds } from "@/lib/dal/reports";
import { getSessionHeading } from "@/lib/dal/sessions";

// The `Comments` slot — SCR-012's «النقاش», written from `Event.dc.html:99-117`, `EventLive.dc.html:70-81`,
// `EventDone.dc.html:86-92` and `EventDesktop.dc.html:86-89` (DEC-208: deleted and written anew; its kept-behaviour
// table is `docs/plan/notes/content.md` § PR B). REQ-EVT-001 … REQ-EVT-008, REQ-EVT-014, REQ-EVT-015.
//
// ★ No `<section>`, no `<h2>`: the page owns both, and the heading row's «N تعليقات» from `commentsSummary()`.
// ★ `null` exactly when `commentsSummary()` says not visible: a cancelled session with nothing ever said.
// ★ The server paints the thread with the viewer, the reaction totals and what the viewer reported; the client
// list keeps it live.

export async function Comments({ sessionId, locale }: SlotProps) {
  const { comments, editWindowMinutes, frozen, isStaffViewer, viewer } = await getCommentsPageData(locale, sessionId);
  const active = comments.filter((c) => !c.deletedAt).length;
  if (active === 0 && frozen) return null;

  const ids = comments.map((c) => c.id);
  const [reactions, reportedIds, heading] = await Promise.all([
    getReactionTotalsForComments(locale, ids),
    getReportedCommentIds(locale, ids),
    getSessionHeading(locale, sessionId),
  ]);

  return (
    <CommentList
      locale={locale}
      sessionId={sessionId}
      viewer={viewer ?? { id: "", displayName: null, avatarUrl: null }}
      isStaffViewer={isStaffViewer}
      editWindowMinutes={editWindowMinutes}
      initialComments={comments}
      initialReactions={reactions}
      initialReported={Array.from(reportedIds)}
      frozen={frozen}
      now={new Date().toISOString()}
      timeZone={heading?.timeZone ?? "Asia/Riyadh"}
    />
  );
}

/** The page's gate and the heading row's count — the same `cache()`d read. */
export async function commentsSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { comments, frozen } = await getCommentsPageData(locale, sessionId);
  const active = comments.filter((c) => !c.deletedAt).length;
  return { visible: active > 0 || !frozen, count: active, outstanding: null };
}
