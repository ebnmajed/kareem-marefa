import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getMaterialsPageData } from "@/lib/dal/materials";
import { formatNumber } from "@/components/sessions/numerals";

// The `Materials` slot (TEAM.md §2 / DEC-046) — the session's materials
// list, phase-gated entirely by `materials_read` (03 §5.5a): this component
// never adds its own phase filter, so what it receives from the DAL is
// already exactly what the viewer is allowed to see.
//
// No <section>/<h2> of its own — the event page owns the landmark and the
// heading (TEAM.md §3, learned in wave 1: a slot repeating it is announced
// twice by a screen reader).
//
// This is the list only (STORY-MAT-001). The in-browser page-by-page viewer
// (SCR-013, STORY-MAT-002) is a follow-up: today "Keynote and links" render
// as a direct link, and pdf/powerpoint materials that have finished
// converting also render as a link to the source, until the viewer route
// exists to link to instead.
export async function Materials({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("materials.list");
  const { materials, numerals } = await getMaterialsPageData(locale, sessionId);

  if (materials.length === 0) {
    return <p className="text-body-sm text-fg-muted">{t("empty")}</p>;
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
              <p className="mt-2 text-body-sm text-fg-heading">{t("substitutionWarning.body", { family: m.fontSubstitutionWarning })}</p>
            ) : null}

            {m.externalUrl ? (
              <a href={m.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-body-sm text-fg-body hover:text-fg-heading">
                {t("openExternal")}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
