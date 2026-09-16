import { getTranslations } from "next-intl/server";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getMaterialsPageData } from "@/lib/dal/materials";
import { formatNumber } from "@/components/sessions/numerals";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Link } from "@/components/ui/link";
import { LinkIcon } from "@/components/ui/icons";
import { SettingsForm } from "@/components/materials/settings-form";
import { UploadForm } from "@/components/materials/upload-form";

// The `Materials` slot — `id="materials"`, «المواد» (`sessions.md` §22.2) —
// the session's materials list, phase-gated entirely by `materials_read`
// (03 §5.5a): this component never adds its own phase filter, so what it
// receives from the DAL is already exactly what the viewer is allowed to
// see.
//
// No <section>/<h2> of its own — the event page owns the landmark and the
// heading. `materialsSummary()` below shares this same cache()d read
// (`sessions.md` §22.4 R-C3) and its `visible` mirrors this component's own
// `null` return exactly (`16` §5.4.1a(b)).
//
// A `pdf` material links to SCR-013 (the viewer) once it has finished
// rendering; links never get a viewer link (REQ-MAT-007) — they render their
// own affordance instead. Uploads are PDF-only for the document kind
// (DEC-058); the uploader states the org's per-kind size limit before a
// file is chosen (REQ-UIX-024).
export async function Materials({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("materials.list");
  const { materials, canManageAll, presenterOfSession, uploadLimits } = await getMaterialsPageData(locale, sessionId);
  const canManage = canManageAll || presenterOfSession;

  // ★ visible === false exactly when this returns null (sessions.md §22.4):
  // nothing to show and no manage right, so there is genuinely no next
  // action `EmptyState` could offer this viewer (REQ-UIX-012's own limit).
  if (materials.length === 0 && !canManage) return null;

  const uploader = canManage ? (
    <div id="materials-upload-form" className="scroll-mt-4">
      <UploadForm locale={locale} sessionId={sessionId} uploadLimits={uploadLimits} />
    </div>
  ) : null;

  if (materials.length === 0) {
    return (
      <div>
        <EmptyState title={t("empty")} action={{ label: t("addAction"), href: "#materials-upload-form" }} size="sm" />
        {uploader}
      </div>
    );
  }

  return (
    <div>
      <p className="text-body-sm text-fg-muted">{t("count", { count: materials.length, value: formatNumber(materials.length) })}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {materials.map((m) => (
          <li key={m.id}>
            <Card density="row">
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-fg-heading">
                      <bdi>{m.title}</bdi>
                    </p>
                    <p className="text-body-sm text-fg-muted">{t(`kind.${m.kind}`)}</p>
                  </div>
                  {/* قبل/بعد — never colour alone: the two phases keep
                      distinct Arabic text on top of the distinct tone. */}
                  <Badge tone={m.phase === "before" ? "info" : "neutral"} outline size="sm" className="shrink-0">
                    {t(`phase.${m.phase}`)}
                  </Badge>
                </div>

                {m.renderStatus === "pending" || m.renderStatus === "rendering" ? (
                  <div className="mt-2 max-w-xs">
                    <Progress label={t("renderStatus.pending")} />
                  </div>
                ) : null}
                {m.renderStatus === "failed" ? (
                  <Badge tone="error" size="sm" className="mt-2">
                    {t("renderStatus.failed")}
                  </Badge>
                ) : null}

                {m.fontSubstitutionWarning ? (
                  <Panel tone="info" className="mt-2 p-3">
                    <p className="text-body-sm text-fg-heading">
                      {t.rich("substitutionWarning.body", { family: m.fontSubstitutionWarning, bdi: (chunks) => <bdi>{chunks}</bdi> })}
                    </p>
                  </Panel>
                ) : null}

                {m.kind === "pdf" && m.renderStatus === "ready" ? (
                  // ★ `ui/link` prefixes the locale itself (`/app/…` arrives
                  // at `/ar/app/…`) — the old raw `next/link` import needed
                  // the manual `/${locale}` prefix this file used to carry;
                  // keeping it here would have doubled it.
                  <Link href={`/app/sessions/${sessionId}/materials/${m.id}`} className="mt-2 inline-block text-body-sm text-fg-body hover:text-fg-heading">
                    {t("openViewer")}
                  </Link>
                ) : null}

                {m.externalUrl ? (
                  <a
                    href={m.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-body-sm text-fg-body hover:text-fg-heading"
                  >
                    <LinkIcon aria-hidden className="text-[0.85em]" />
                    {t("openExternal")}
                  </a>
                ) : null}

                {canManage ? <SettingsForm locale={locale} materialId={m.id} phase={m.phase} allowDownload={m.allowDownload} /> : null}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
      {uploader}
    </div>
  );
}

/**
 * `sessions.md` §22.3's `SlotSummaryReader` — the page ANDs this with its
 * own `can.materials !== "none"` gate (§22.2) before rendering the
 * `<section>`/`<h2>` at all. Shares `getMaterialsPageData`'s `cache()`d
 * read.
 */
export async function materialsSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { materials, canManageAll, presenterOfSession } = await getMaterialsPageData(locale, sessionId);
  const canManage = canManageAll || presenterOfSession;
  return { visible: materials.length > 0 || canManage, count: materials.length, outstanding: null };
}
