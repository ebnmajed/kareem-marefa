import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { listCommentReports } from "@/lib/dal/admin-moderation";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { resolveComment } from "./actions";
import { ReportCard } from "./report-card";

// SCR-050 · /app/admin/moderation/comments (REQ-ADM-010, REQ-EVT-008,
// REQ-EVT-014). Staff — admin or moderator (REQ-ADM-020's "moderation
// queues"). See src/lib/dal/admin-moderation.ts's header for why this is
// the report queue rather than "every comment": a comment has no takedown
// concept, only reports (DEC-005).

function ageInDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function CommentModerationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [reports, prefs, t] = await Promise.all([listCommentReports(locale), getOrgPrefs(locale), getTranslations("admin.moderation")]);
  if (reports === null) notFound();

  const num = (n: number) => formatNumber(n, prefs.numerals);
  const action = (reportId: string) => resolveComment.bind(null, locale as Locale, reportId);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("commentsTitle")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("commentsIntro")}</p>

      {reports.length === 0 ? (
        <p className="mt-8 text-body text-fg-body">{t("commentsEmpty")}</p>
      ) : (
        <ul className="mt-8 max-w-3xl space-y-5">
          {reports.map((r) => (
            <ReportCard key={r.reportId} action={action(r.reportId)}>
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
          ))}
        </ul>
      )}
    </>
  );
}
