import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getViewerData } from "@/lib/dal/materials";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { InfoIcon } from "@/components/ui/icons";
import { PageViewer } from "@/components/viewer/page-viewer";
import { DownloadButton } from "./download-button";

// SCR-013 — the viewer (REQ-MAT-002…005, REQ-MAT-007, REQ-MAT-010…012).
// getViewerData() returns null for a phase-gated-out or genuinely absent
// material alike — deliberately indistinguishable (03 §5.5a is the read
// policy; there is nothing this page could say that would not either leak
// which case it is, or be wrong for one of them).
export default async function MaterialViewerPage({ params }: { params: Promise<{ locale: string; id: string; materialId: string }> }) {
  const { locale, id, materialId } = await params;
  const [t, tList] = await Promise.all([getTranslations("materials.viewer"), getTranslations("materials.list")]);
  const data = await getViewerData(locale, materialId);
  if (!data) notFound();

  return (
    <div>
      {/* `ui/page-header` — `16` §6.1 note 5, REQ-UIX-001: every screen uses
          it. A one-level breadcrumb reusing today's existing "back to
          session" copy as its label rather than fetching the session's own
          title for a single crumb (`ViewerData` carries no session title,
          and PageHeader's own worked examples show real names only where
          the trail is two or three levels deep, which this is not). The
          href is unprefixed — `ui/link` (which the breadcrumb renders
          through) adds the locale itself. */}
      <PageHeader title={data.title} breadcrumb={[{ href: `/app/sessions/${id}`, label: t("back") }]} breadcrumbLabel={t("breadcrumbLabel")} eyebrow={tList(`kind.${data.kind}`)} />

      {data.renderStatus === "pending" || data.renderStatus === "rendering" ? (
        <Panel tone="neutral" className="mt-6">
          <p className="text-body text-fg-muted">{t("states.pending")}</p>
        </Panel>
      ) : data.renderStatus === "failed" ? (
        <Panel tone="error" className="mt-6">
          <p className="text-body text-fg-heading">{t("states.failed")}</p>
        </Panel>
      ) : data.pages.length > 0 ? (
        <div className="mt-6">
          {data.fontSubstitutionWarning ? (
            <Panel tone="info" className="mb-4 flex items-start gap-2 p-3">
              <InfoIcon aria-hidden className="mt-0.5 shrink-0" />
              <p className="text-body-sm text-fg-heading">
                {tList.rich("substitutionWarning.body", { family: data.fontSubstitutionWarning, bdi: (chunks) => <bdi>{chunks}</bdi> })}
              </p>
            </Panel>
          ) : null}
          <PageViewer pages={data.pages} rtl={locale !== "en"} title={data.title} />
          <div className="mt-6">
            <DownloadButton locale={locale} materialId={materialId} allowDownload={data.allowDownload} />
          </div>
        </div>
      ) : (
        <p className="mt-6 text-body-sm text-fg-muted">{t("states.noPages")}</p>
      )}
    </div>
  );
}
