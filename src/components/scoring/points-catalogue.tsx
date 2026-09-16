import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { CatalogueEntry } from "@/lib/dal/points";

// SCR-022's "what earns what" half (05 §8). Read live from scoring_rules —
// never a hard-coded list, so an admin's edit shows here immediately
// (REQ-PTS-014). The negative catalogue (no_show, late_cancellation,
// comment_removed, photo_removed) ships at zero points by default (D40)
// and explains itself on the ledger row it produces, not here — listing
// "worth 0 points" actions in a "what earns points" table reads as a
// non-sequitur even though the rows exist for a reason.
export async function PointsCatalogue({ entries }: { entries: CatalogueEntry[]; }) {
  const t = await getTranslations("scoring.points");
  const visible = entries.filter((entry) => entry.points > 0);

  if (visible.length === 0) return null;

  return (
    <section id="catalogue" aria-labelledby="catalogue-heading" className="mt-12">
      <h2 id="catalogue-heading" className="text-h2 text-fg-heading">
        {t("catalogue.heading")}
      </h2>
      <p className="mt-2 text-body text-fg-muted">{t("catalogue.intro")}</p>
      <ul className="mt-4 space-y-2">
        {visible.map((entry) => (
          <li key={entry.actionKey} className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-edge p-3">
            <p className="text-body text-fg-heading">
              <bdi>{entry.reasonAr}</bdi>
            </p>
            <div className="flex flex-wrap items-center gap-3 text-body-sm text-fg-muted">
              <span>{t("catalogue.pointsValue", { count: entry.points, value: formatNumber(entry.points) })}</span>
              <span>
                {entry.capPerSession != null
                  ? t("catalogue.cap", { count: entry.capPerSession, value: formatNumber(entry.capPerSession) })
                  : t("catalogue.noCap")}
              </span>
              {!entry.enabled ? <span>{t("catalogue.disabled")}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
