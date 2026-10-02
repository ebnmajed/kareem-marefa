import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { SectionHeader } from "@/components/ui/section-header";
import type { CatalogueEntry } from "@/lib/dal/points";

// «ماذا يمنحك نقاطًا؟» — SCR-022's catalogue (`Points.dc.html`, `M10c.md` §2; wave 20, REQ-UIX-072, REQ-PTS-014,
// `05` §8). scoring's file.
//
// ★ Read live from `scoring_rules` — never a hard-coded list — so an admin's edit shows here at once. One list card:
// the rule's own name, its cap in words, its value. ★ A disabled rule says so and draws `0` (M10c §2, DEC-218): it
// earns nothing now, and a figure it does not pay would be a promise. A rule worth zero while enabled — the negative
// catalogue, off by default (REQ-PTS-008) — is not listed: it explains itself on the row it produces. No intro line
// (REQ-UIX-080).

export async function PointsCatalogueList({ entries }: { entries: CatalogueEntry[] }) {
  const t = await getTranslations("scoring.points.catalogue");
  const visible = entries.filter((entry) => entry.points > 0);
  if (visible.length === 0) return null;

  return (
    // `id="catalogue"` on the SECTION: `points.spec.ts` scopes to it, so the catalogue's repeat of a rule's reason
    // never matches a history row by the same text.
    <section id="catalogue" aria-labelledby="catalogue-heading" className="flex flex-col gap-2">
      <SectionHeader id="catalogue-heading" title={t("heading")} />
      <ul className="flex flex-col rounded-tile border border-edge bg-surface">
        {visible.map((entry) => {
          const value = entry.enabled ? entry.points : 0;
          return (
            <li
              key={entry.actionKey}
              data-enabled={entry.enabled ? "true" : "false"}
              className={`flex items-center gap-2.5 border-b border-edge px-3.5 py-2.5 text-body-sm last:border-b-0 ${entry.enabled ? "" : "text-fg-muted"}`}
            >
              <span className={`flex-1 font-bold ${entry.enabled ? "text-fg-heading" : ""}`}>
                <bdi>{entry.reasonAr}</bdi>
              </span>
              <span className="text-fg-muted">
                {entry.enabled
                  ? entry.capPerSession != null
                    ? t("cap", { count: entry.capPerSession, value: formatNumber(entry.capPerSession) })
                    : t("noCap")
                  : t("disabled")}
              </span>
              <span className={`w-11 text-end font-display text-play-sm font-extrabold ${entry.enabled ? "text-accent pg-light:text-fg-heading" : ""}`}>
                <span className="sr-only">{t("pointsValue", { count: value, value: formatNumber(value) })}</span>
                <bdi aria-hidden="true">{formatNumber(value)}</bdi>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
