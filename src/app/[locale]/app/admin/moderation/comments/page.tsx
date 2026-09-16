import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { ModerationTabs } from "@/components/admin/moderation-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listCommentReports, listModerationCounts } from "@/lib/dal/admin-moderation";
import { resolveComment } from "./actions";
import { ReportCard } from "./report-card";

// SCR-050 · /app/admin/moderation/comments (REQ-ADM-010, REQ-EVT-008,
// REQ-EVT-014), rebuilt onto the system for wave 7 (`16` §6.7, `DEC-137`).
// Staff — admin or moderator (REQ-ADM-020's "moderation queues"). See
// src/lib/dal/admin-moderation.ts's header for why this is the report queue
// rather than "every comment": a comment has no takedown concept, only
// reports (DEC-005).

function ageInDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function CommentModerationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [reports, counts, t] = await Promise.all([listCommentReports(locale), listModerationCounts(locale), getTranslations("admin.moderation")]);
  if (reports === null || counts === null) notFound();

  const num = (n: number) => formatNumber(n);
  const action = (reportId: string) => resolveComment.bind(null, locale as Locale, reportId);

  return (
    <>
      <PageHeader title={t("commentsTitle")} description={t("commentsIntro")} />
      <div className="mt-6">
        <ModerationTabs current="comments" counts={counts} />
      </div>

      {reports.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t("commentsEmpty")} action={{ label: t("commentsEmptyAction"), href: "/app/admin" }} />
        </div>
      ) : (
        <ul className="mt-8 max-w-3xl space-y-5">
          {reports.map((r) => (
            <li key={r.reportId}>
              <ReportCard action={action(r.reportId)} sessionTitle={r.sessionTitle}>
                <p className="text-body-sm text-fg-muted">{t("age", { count: ageInDays(r.createdAt), value: num(ageInDays(r.createdAt)) })}</p>
                <blockquote className="mt-2 border-s-2 border-edge-strong ps-4 text-body text-fg-heading">
                  <bdi>{r.commentBody}</bdi>
                </blockquote>
                {r.commentDeleted ? <p className="mt-1 text-body-sm text-fg-muted">{t("commentDeletedNote")}</p> : null}
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
                  <div className="flex gap-2">
                    <dt className="text-fg-muted">{t("uploaderLabel")}</dt>
                    <dd className="text-fg-body">
                      <bdi>{r.commentAuthorName ?? "—"}</bdi>
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-fg-muted">{t("sessionLabel")}</dt>
                    <dd className="text-fg-body">
                      <bdi>{r.sessionTitle}</bdi>
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-fg-muted">{t("reporterLabel")}</dt>
                    <dd className="text-fg-body">
                      <bdi>{r.reporterName ?? "—"}</bdi>
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-body-sm text-fg-body">
                  {t("reasonGiven")}: <bdi>{r.reason}</bdi>
                </p>
              </ReportCard>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
