import { getTranslations } from "next-intl/server";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { CheckIcon } from "@/components/ui/icons";
import { CupObject } from "@/components/ui/objects/cup";
import type { CompanyCup } from "@/lib/dal/leaderboards";

// «كأس الربع» — SCR-028's cup card (`Companies.dc.html`, `M10c.md` §8; wave 20, DEC-219 §2 as corrected, REQ-UIX-079,
// REQ-LDR-005, REQ-LDR-006). scoring's file.
//
// ★ Everything drawn is the quarter snapshot's: which quarter, the month of three it is in («الجولة N من 3»), the days
// left in the org's zone, provisional or final, the metric it was ranked by — frozen on the snapshot, so a closed
// quarter keeps its own (REQ-LDR-005) — and when it was taken. A final quarter is frozen by 0027's guards: the cup is
// handed over and cannot move. «بلا ترتيب» is not drawn (the owner's, `DEC-219` §2; `DEC-218` §3.3 stands for it).

const ROUNDS = 3; // the months of a quarter — the quarter's own length, not a setting
// The catalogue's selector words for the quarter, so no digit is frozen into the copy (REQ-INT-006).
const QUARTER_KEY = ["first", "second", "third", "fourth"] as const;

export async function CupCard({ cup, locale }: { cup: CompanyCup; locale: string }) {
  const t = await getTranslations("leaderboards");
  return (
    <section aria-labelledby="cup-heading" className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-4">
      <div className="flex items-center gap-3">
        <CupObject size={48} shadow={false} />
        <div className="min-w-0 flex-1 leading-snug">
          <h2 id="cup-heading" className="font-display text-play-sm font-extrabold text-fg-heading">
            {t("cup.title", { quarter: QUARTER_KEY[cup.quarter - 1] ?? "fourth" })}
          </h2>
          <p className="text-caption text-fg-muted">
            {cup.isFinal ? (
              t("company.final")
            ) : (
              <>
                {t.rich("cup.round", { round: formatNumber(cup.round), rounds: formatNumber(ROUNDS), bdi: (c) => <bdi>{c}</bdi> })}
                {" · "}
                {t.rich("cup.days", { count: cup.daysLeft ?? 0, value: formatNumber(cup.daysLeft ?? 0), bdi: (c) => <bdi>{c}</bdi> })}
              </>
            )}
          </p>
          <p className="text-caption font-semibold text-fg-body">{t("cup.awarded")}</p>
        </div>
      </div>
      {/* The state, the ranked-by chip and when it was taken, on their own row under the title — the artboard's stack;
          beside the title the long provisional chip squeezed the text column to a word a line at 390 (the lead's X1). */}
      <div className="flex flex-wrap items-center gap-2 text-caption text-fg-muted">
        <Badge tone={cup.isFinal ? "success" : "info"} size="sm">
          {cup.isFinal ? t("company.final") : t("cup.provisional")}
        </Badge>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-edge bg-raised px-3 py-1 font-bold text-fg-heading">
          <CheckIcon />
          {t(`company.rankedMetricLabel.${cup.metric}`)}
        </span>
        <span className="ms-auto">{t.rich("company.takenAt", { date: formatDateTime(cup.takenAt, cup.timeZone, locale), bdi: (c) => <bdi>{c}</bdi> })}</span>
      </div>
    </section>
  );
}
