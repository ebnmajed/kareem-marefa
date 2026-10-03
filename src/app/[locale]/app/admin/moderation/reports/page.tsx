import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { PageHeader } from "@/components/ui/page-header";
import { TagChip } from "@/components/ui/tag-chip";
import type { Locale } from "@/i18n/routing";
import { listCommentReportQueue, type ReportState } from "@/lib/dal/admin-moderation";
import { dismissReportedComment, removeReportedComment } from "./actions";
import { ReportsTable } from "./_components/reports-table";

// SCR-050/052 · البلاغات — REQ-UIX-103, REQ-ADM-010, REQ-EVT-008, REQ-EVT-014. Written from
// `AdminModerationReports.dc.html` in wave 22 (DEC-208: deleted first; the kept-behaviour table is
// `docs/plan/notes/content.md` W22.3).
//
// ★ THE JOB (DEC-231 §0.2): moderation is ACTIONED, not listed. One row per reported comment — the comment, its author,
// the session, who reported it and why, how long ago — and the decision in that row: «تجاهل», or «أزل» with a reason.
// «مغلقة» shows what was decided and by whom, the first place in the product a resolved report is visible.
//
// Admin and moderator (REQ-ADM-020); a member gets `null` from the read and the streamed not-found (DEC-134). The
// page renders nothing of the console frame: its `h1` row and its content.

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const state: ReportState = query.state === "closed" ? "closed" : "open";

  const [queue, t] = await Promise.all([listCommentReportQueue(locale, state), getTranslations("event.moderation")]);
  if (!queue) notFound();

  return (
    <>
      <PageHeader title={t("title")} className="mb-4" />
      <nav aria-label={t("filtersLabel")} className="mb-4">
        <ul className="flex flex-wrap gap-2">
          <li>
            <TagChip label={`${t("filter.open")} ${formatNumber(queue.openCount)}`} href="/app/admin/moderation/reports" selected={state === "open"} />
          </li>
          <li>
            <TagChip label={t("filter.closed")} href="/app/admin/moderation/reports?state=closed" selected={state === "closed"} />
          </li>
        </ul>
      </nav>
      <ReportsTable
        rows={queue.rows}
        state={state}
        remove={removeReportedComment.bind(null, locale as Locale)}
        dismiss={dismissReportedComment.bind(null, locale as Locale)}
      />
    </>
  );
}
