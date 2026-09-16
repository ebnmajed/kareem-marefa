import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { SectionHeader } from "@/components/ui/section-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import type { CatalogueEntry } from "@/lib/dal/points";

// SCR-022's "what earns what" half (05 §8). Read live from scoring_rules —
// never a hard-coded list, so an admin's edit shows here immediately
// (REQ-PTS-014). The negative catalogue (no_show, late_cancellation,
// comment_removed, photo_removed) ships at zero points by default (D40)
// and explains itself on the ledger row it produces, not here — listing
// "worth 0 points" actions in a "what earns points" table reads as a
// non-sequitur even though the rows exist for a reason.
export async function PointsCatalogue({ entries }: { entries: CatalogueEntry[] }) {
  const t = await getTranslations("scoring.points");
  const visible = entries.filter((entry) => entry.points > 0);

  if (visible.length === 0) return null;

  return (
    // ★ `id="catalogue"` on the SECTION, not just `catalogue-heading` on the
    // title: `tests/e2e/points.spec.ts` (pre-existing, real) scopes a
    // locator to it so the catalogue's own repeat of a rule's `reasonAr`
    // never matches the history row above it by the same text.
    <section id="catalogue" aria-labelledby="catalogue-heading" className="mt-12">
      <SectionHeader id="catalogue-heading" title={t("catalogue.heading")} description={t("catalogue.intro")} />
      <ul className="mt-4 space-y-2">
        {visible.map((entry) => (
          <li key={entry.actionKey}>
            <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
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
                {!entry.enabled ? <Badge tone="neutral" size="sm">{t("catalogue.disabled")}</Badge> : null}
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </section>
  );
}
