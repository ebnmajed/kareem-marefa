import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getViewerData } from "@/lib/dal/materials";
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
      <Link href={`/${locale}/app/sessions/${id}`} className="text-body-sm text-fg-body hover:text-fg-heading">
        ← {t("back")}
      </Link>
      <h1 className="mt-3 text-h1 text-fg-heading">
        <bdi>{data.title}</bdi>
      </h1>

      {data.kind === "keynote" ? (
        <div className="mt-6">
          <p className="text-body text-fg-heading">{t("states.keynoteDownloadOnly")}</p>
          <p className="mt-1 text-body-sm text-fg-muted">{t("states.keynoteHint")}</p>
          <div className="mt-4">
            <DownloadButton locale={locale} materialId={materialId} allowDownload={data.allowDownload} />
          </div>
        </div>
      ) : data.renderStatus === "pending" || data.renderStatus === "rendering" ? (
        <p className="mt-6 text-body text-fg-muted">{t("states.pending")}</p>
      ) : data.renderStatus === "failed" ? (
        <p className="mt-6 text-body text-fg-heading">{t("states.failed")}</p>
      ) : data.pages.length > 0 ? (
        <div className="mt-6">
          {data.fontSubstitutionWarning ? (
            <p className="mb-4 rounded-field border border-edge p-3 text-body-sm text-fg-heading">
              {tList("substitutionWarning.body", { family: data.fontSubstitutionWarning })}
            </p>
          ) : null}
          <PageViewer pages={data.pages} numerals={data.numerals} rtl={locale !== "en"} title={data.title} />
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
