import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { listPhotoReports } from "@/lib/dal/admin-moderation";
import { resolveReport } from "./actions";
import { ReportCard } from "./report-card";

// SCR-052 · /app/admin/moderation/reports (REQ-ADM-010, REQ-EVT-008,
// DEC-005). Open reports on PHOTOS that have NOT been hidden — distinct
// from SCR-051's takedown queue (already hidden). "Reports" here is
// photo-specific, not a merged all-content inbox: comment reports have
// their own screen (SCR-050) because comments have no takedown concept to
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
      <h1 className="text-h1 text-fg-heading">{t("photosReportsTitle")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("photosReportsIntro")}</p>

      {reports.length === 0 ? (
        <p className="mt-8 text-body text-fg-body">{t("photosReportsEmpty")}</p>
      ) : (
        <ul className="mt-8 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          {reports.map((r) => (
            <ReportCard key={r.reportId} action={action(r.reportId, r.photoId)}>
              <p className="text-body-sm text-fg-muted">{t("age", { count: ageInDays(r.createdAt), value: num(ageInDays(r.createdAt)) })}</p>
              {r.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static/optimizable asset
                <img src={r.photoUrl} alt="" className="mt-2 aspect-video w-full rounded-field object-cover" />
              ) : null}
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
          ))}
        </ul>
      )}
    </>
  );
}
