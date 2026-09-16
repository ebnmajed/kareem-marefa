import { getTranslations } from "next-intl/server";
import { PRESETS, type PresetName } from "@kareem/designer-runtime";
import type { ExportArtifact, ExportQueueData } from "@/lib/dal/designer";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import type { Tone } from "@/components/ui";
import { ExportActionButton } from "@/components/designer/export-action-button";
import { retryArtifact } from "@/app/[locale]/app/admin/designer/[documentId]/actions";

// SCR-057's export queue — REQ-DSG-011, REQ-DSG-012, REQ-DSG-013, A29, after
// `PosterFlow.dc.html`'s «طابور التصدير».
//
// «The admin sees queued / rendering / done / failed per variant, and a
// failed export states WHAT failed and offers a retry.» The worker's own
// message is shown verbatim rather than mapped to a friendly sentence: «the
// face never resolved» and «the document changed after this export was
// requested» call for different actions, and a shared "something went wrong"
// would hide both.
//
// The RGB caveat sits beside the print rows, not in a footnote (REQ-DSG-011).

const STATUS_TONE: Record<ExportArtifact["status"], { tone: Tone; outline?: boolean }> = {
  queued: { tone: "neutral", outline: true },
  rendering: { tone: "info" },
  ready: { tone: "success" },
  failed: { tone: "error" },
};

export async function ExportPanel({
  documentId,
  queue,
  canExport,
  locale,
  links,
}: {
  documentId: string;
  queue: ExportQueueData;
  canExport: boolean;
  locale: string;
  /** Signed URLs of the READY artifacts, by artifact id — signed once by the
   *  page for the strip and the list alike. */
  links: Record<string, string>;
}) {
  const t = await getTranslations("designer.exports");
  const tp = await getTranslations("designer.presets");

  const hasPrint = queue.artifacts.some((a) => PRESETS[a.preset as PresetName]?.bleed > 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-body-sm text-fg-muted">{t("intro")}</p>

      {queue.artifacts.length === 0 ? (
        canExport ? (
          <EmptyState size="sm" title={t("emptyTitle")} description={t("emptyDescription")} action={{ label: t("approve"), href: "#dr-export-request" }} />
        ) : (
          <Panel>
            <p className="text-body-sm text-fg-muted">{t("none")}</p>
          </Panel>
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {queue.artifacts.map((artifact) => {
            const link = links[artifact.id];
            const tone = STATUS_TONE[artifact.status];
            return (
              <li key={artifact.id} className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="text-label text-fg-heading">
                    <bdi>{tp(`name.${artifact.preset}`)}</bdi>
                  </p>
                  <Badge size="sm" outline>
                    <bdi dir="ltr">{artifact.format.toUpperCase()}</bdi>
                  </Badge>
                  <Badge size="sm" tone={tone.tone} outline={tone.outline}>
                    {t(`status.${artifact.status}`)}
                  </Badge>
                  <span className="grow" />
                  {link ? (
                    <a href={link} download className={buttonClass("secondary", "sm")}>
                      <DownloadIcon />
                      <span>{t("download")}</span>
                    </a>
                  ) : null}
                  {canExport && artifact.status === "failed" ? (
                    <ExportActionButton
                      action={retryArtifact.bind(null, locale, documentId, artifact.id)}
                      label={t("retry")}
                      pendingLabel={t("retryPending")}
                      variant="secondary"
                      size="sm"
                    />
                  ) : null}
                </div>

                {artifact.status === "failed" && artifact.error ? (
                  <p role="alert" className="text-body-sm text-error">
                    {t.rich("failed", { reason: artifact.error, bdi: (c) => <bdi dir="ltr">{c}</bdi> })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {hasPrint ? (
        <Panel tone="info">
          <p className="text-body-sm text-fg-body">{t("rgbCaveat")}</p>
        </Panel>
      ) : null}

      <p className="text-body-sm text-fg-muted">{t("cacheNote")}</p>
    </div>
  );
}
