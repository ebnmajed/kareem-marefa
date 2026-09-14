import { getTranslations } from "next-intl/server";
import { PRESETS, type PresetName } from "@kareem/designer-runtime";
import type { ExportQueueData } from "@/lib/dal/designer";
import { signExportUrl } from "@/lib/dal/designer";
import { queueExports, retryArtifact } from "@/app/[locale]/app/admin/designer/[documentId]/actions";

// SCR-057's export queue — REQ-DSG-011, REQ-DSG-012, REQ-DSG-013, A29.
//
// «The admin sees queued / rendering / done / failed per variant, and a
// failed export states WHAT failed and offers a retry.» The worker's own
// message is shown verbatim rather than mapped to a friendly sentence: «the
// face never resolved» and «the document changed after this export was
// requested» call for different actions, and a shared "something went wrong"
// would hide both.
//
// The RGB caveat sits beside the print rows, not in a footnote (REQ-DSG-011).
// A print shop receiving an RGB PDF will convert it and the navy will shift;
// saying so costs one line of UI, and discovering it on 200 printed posters
// does not.

const action = "h-11 rounded-field border border-edge-strong px-4 text-body-sm text-fg-heading";

export async function ExportPanel({
  documentId,
  queue,
  canExport,
  locale,
}: {
  documentId: string;
  queue: ExportQueueData;
  canExport: boolean;
  locale: string;
}) {
  const t = await getTranslations("designer.exports");
  const tp = await getTranslations("designer.presets");

  // Signed on render, 5 minutes, through `exports_storage_read` (03 §6).
  const links = await Promise.all(
    queue.artifacts.map(async (a) => (a.storagePath && a.status === "ready" ? await signExportUrl(locale, a.storagePath) : null)),
  );

  const hasPrint = queue.artifacts.some((a) => PRESETS[a.preset as PresetName]?.bleed > 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-fg-muted">{t("intro")}</p>

      {queue.artifacts.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {queue.artifacts.map((artifact, i) => (
            <li key={artifact.id} className="rounded-field border border-edge p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-body-sm text-fg-heading">
                  <bdi>{tp(`name.${artifact.preset}`)}</bdi>
                </p>
                <p className="text-body-sm text-fg-muted">
                  <bdi dir="ltr">{artifact.format.toUpperCase()}</bdi>
                </p>
                <p className="text-body-sm text-fg-muted">{t(`status.${artifact.status}`)}</p>
              </div>

              {artifact.status === "failed" && artifact.error ? (
                <p role="alert" className="mt-2 text-body-sm text-fg-heading">
                  {t.rich("failed", { reason: artifact.error, bdi: (c) => <bdi dir="ltr">{c}</bdi> })}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-2">
                {links[i] ? (
                  <a href={links[i] as string} className={`${action} inline-flex items-center`} download>
                    {t("download")}
                  </a>
                ) : null}
                {canExport && artifact.status === "failed" ? (
                  <form action={retryArtifact}>
                    <input type="hidden" name="documentId" value={documentId} />
                    <input type="hidden" name="artifactId" value={artifact.id} />
                    <button type="submit" className={action}>
                      {t("retry")}
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasPrint ? <p className="rounded-field border border-edge bg-silver-100 p-3 text-body-sm text-fg-body">{t("rgbCaveat")}</p> : null}

      {canExport ? (
        <form action={queueExports}>
          <input type="hidden" name="documentId" value={documentId} />
          <button type="submit" className={action}>
            {queue.artifacts.length ? t("requestAgain") : t("request")}
          </button>
        </form>
      ) : null}

      <p className="text-body-sm text-fg-muted">{t("cacheNote")}</p>
    </div>
  );
}
