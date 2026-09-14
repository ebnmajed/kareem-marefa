import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getMaterialsPageData } from "@/lib/dal/materials";
import { formatNumber } from "@/components/sessions/numerals";
import { SettingsForm } from "@/components/materials/settings-form";
import { UploadForm } from "@/components/materials/upload-form";

// The `Materials` slot (TEAM.md §2 / DEC-046) — the session's materials
// list, phase-gated entirely by `materials_read` (03 §5.5a): this component
// never adds its own phase filter, so what it receives from the DAL is
// already exactly what the viewer is allowed to see.
//
// No <section>/<h2> of its own — the event page owns the landmark and the
// heading (TEAM.md §3, learned in wave 1: a slot repeating it is announced
// twice by a screen reader).
//
// A `pdf`/`powerpoint` material links to SCR-013 (the viewer) once it has
// finished rendering; Keynote and links never get a viewer link (DEC-006 /
// REQ-MAT-007) — they render their own affordance instead.
export async function Materials({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("materials.list");
  const { materials, numerals, canManageAll, presenterOfSession } = await getMaterialsPageData(locale, sessionId);
  const canManage = canManageAll || presenterOfSession;

  if (materials.length === 0) {
    return (
      <div>
        <p className="text-body-sm text-fg-muted">{t("empty")}</p>
        {canManage ? <UploadForm locale={locale} sessionId={sessionId} /> : null}
      </div>
    );
  }

  return (
    <div>
      <p className="text-body-sm text-fg-muted">{t("count", { count: materials.length, value: formatNumber(materials.length, numerals) })}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {materials.map((m) => (
          <li key={m.id} className="rounded-field border border-edge p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-body font-medium text-fg-heading">
                  <bdi>{m.title}</bdi>
                </p>
                <p className="text-body-sm text-fg-muted">
                  {t(`kind.${m.kind}`)} · {t(`phase.${m.phase}`)}
                </p>
              </div>
              {m.kind === "keynote" ? <span className="text-body-sm text-fg-muted">{t("downloadOnly")}</span> : null}
            </div>

            {m.kind === "keynote" ? <p className="mt-2 text-body-sm text-fg-muted">{t("downloadOnlyHint")}</p> : null}

            {m.renderStatus === "pending" || m.renderStatus === "rendering" ? <p className="mt-2 text-body-sm text-fg-muted">{t("renderStatus.pending")}</p> : null}
            {m.renderStatus === "failed" ? <p className="mt-2 text-body-sm text-fg-heading">{t("renderStatus.failed")}</p> : null}

            {m.fontSubstitutionWarning ? (
              <p className="mt-2 text-body-sm text-fg-heading">
                {t.rich("substitutionWarning.body", { family: m.fontSubstitutionWarning, bdi: (chunks) => <bdi>{chunks}</bdi> })}
              </p>
            ) : null}

            {(m.kind === "pdf" || m.kind === "powerpoint") && m.renderStatus === "ready" ? (
              <Link href={`/${locale}/app/sessions/${sessionId}/materials/${m.id}`} className="mt-2 inline-block text-body-sm text-fg-body hover:text-fg-heading">
                {t("openViewer")}
              </Link>
            ) : null}

            {m.externalUrl ? (
              <a href={m.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-body-sm text-fg-body hover:text-fg-heading">
                {t("openExternal")}
              </a>
            ) : null}

            {canManage ? <SettingsForm locale={locale} materialId={m.id} phase={m.phase} allowDownload={m.allowDownload} /> : null}
          </li>
        ))}
      </ul>
      {canManage ? <UploadForm locale={locale} sessionId={sessionId} /> : null}
    </div>
  );
}
