import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Sticker } from "@/components/ui/sticker";
import type { ProposeEarnings } from "@/lib/dal/proposals";

// SCR-017's earn panel — `Propose.dc.html`'s «+100 للتقديم…», DEC-213 §5.96, contract 6.
//
// ★ EVERY FIGURE IS READ: the points are `getProposeEarnings()`'s sum of the org's presenter rules paid at
// completion, the badge is the org's own first-session badge by its own name. ★ ABSENT AT ZERO: no points, no panel —
// the panel is a promise of points, and a badge alone does not make one; a `+0` is never drawn.

export async function EarnPanel({ earnings }: { earnings: ProposeEarnings }) {
  if (earnings.points === null) return null;
  const t = await getTranslations("proposals.propose.earn");
  return (
    <div className="flex items-center gap-3 rounded-panel border border-edge bg-surface px-3.5 py-3">
      <Sticker fill="gold" rotate={-4} size="sm" informative>
        <bdi>{t("points", { value: formatNumber(earnings.points) })}</bdi>
      </Sticker>
      <p className="text-body-sm text-fg-muted">
        {t("body")}
        {earnings.firstSessionBadge ? (
          <>
            {" "}
            {t.rich("badge", { badge: earnings.firstSessionBadge, t: (chunks) => <bdi>{chunks}</bdi> })}
          </>
        ) : null}
      </p>
    </div>
  );
}
