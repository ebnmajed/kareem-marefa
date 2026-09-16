import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listPhotoReports } from "@/lib/dal/admin-moderation";
import { resolveReport } from "./actions";
import { ReportCard } from "./report-card";

// SCR-052 · /app/admin/moderation/reports (REQ-ADM-010, REQ-EVT-008,
// DEC-005), rebuilt onto the system for wave 6 (`16` §6.7, `DEC-130`). Open
// reports on PHOTOS that have NOT been hidden — distinct from SCR-051's
// takedown queue (already hidden). "Reports" here is photo-specific, not a
// merged all-content inbox: comment reports have their own screen (SCR-050,
// not this track's this wave) because comments have no takedown concept to
// contrast against, so nothing about them needs the same split.

function ageInDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function PhotoReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [reports, t] = await Promise.all([listPhotoReports(locale), getTranslations("admin.moderation")]);
  if (reports === null) notFound();

  const num = (n: number) => formatNumber(n);
  const action = (reportId: string, photoId: string) => resolveReport.bind(null, locale as Locale, reportId, photoId);

  return (
    <>
      <PageHeader title={t("photosReportsTitle")} description={t("photosReportsIntro")} />

      {reports.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t("photosReportsEmpty")} action={{ label: t("photosReportsEmptyAction"), href: "/app/admin" }} />
        </div>
      ) : (
        <ul className="mt-8 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          {reports.map((r) => (
            <li key={r.reportId}>
              <ReportCard action={action(r.reportId, r.photoId)} photoUrl={r.photoUrl} sessionTitle={r.sessionTitle}>
                <p className="text-body-sm text-fg-muted">{t("age", { count: ageInDays(r.createdAt), value: num(ageInDays(r.createdAt)) })}</p>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
                  <div className="flex gap-2">
                    <dt className="text-fg-muted">{t("uploaderLabel")}</dt>
                    <dd className="text-fg-body">
                      <bdi>{r.uploaderName ?? "—"}</bdi>
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
