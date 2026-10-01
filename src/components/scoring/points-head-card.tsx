import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { PointsHeadGate } from "@/components/scoring/points-head-gate";
import { PointsLevelTurn } from "@/components/scoring/points-level-turn";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { PointsHead } from "@/lib/dal/points";

// SCR-022's head card — `Points.dc.html`, `M10c.md` §2 (wave 20, REQ-UIX-072, DEC-218 §3.1). scoring's file.
//
// «رصيدك» and the balance in the display face at the inline-start; the level and the way to the next at the
// inline-end; the bar under both. The balance stays the page's one `<strong>` (`points.spec.ts` reads it).
//
// ★ Moments 3 and 4 are `MomentPointsHead`'s, unchanged in what they do: the balance counts from the figure last seen
// with «+N» beside it, the bar fills — and the level row turns in place when a level reached is unseen (DEC-218
// §3.1). The server draws the END frame; the moment moves it once. It sits behind the displayed-copy gate, because
// from `lg` the band holds the same occurrence beside it, and only the copy on screen may claim it.
//
// ★ Every figure is read: the level the nightly evaluation stored, never recomputed; `levelProgress()`'s fraction,
// which the line beside the bar states in the same numbers («"<next>" بعد N» is threshold − balance).

export async function PointsHeadCard({ head, acknowledge, documentLoad = false }: { head: PointsHead; acknowledge: () => Promise<void>; documentLoad?: boolean }) {
  const [t, th] = await Promise.all([getTranslations("scoring.points.head"), getTranslations("scoring.hub.level")]);

  const line = head.level
    ? head.next
      ? th.rich("toNext", { level: head.next.name, value: formatNumber(Math.max(0, head.next.threshold - head.totalPoints)), bdi: (c) => <bdi>{c}</bdi> })
      : t("level.top")
    : t("level.none");

  const card = head.level ? (
    <PointsLevelTurn
      held={{ caption: head.levelUp ? t("level.caption") : th("caption"), name: head.levelUp ? head.levelUp.held.name : head.level.name }}
      reached={head.levelUp ? { caption: t("level.reachedCaption"), name: head.level.name } : null}
      line={line}
    />
  ) : (
    <p className="max-w-40 text-end text-caption text-fg-muted">{line}</p>
  );

  const bar =
    head.level && head.progress ? (
      <div data-slot="level-bar">
        {/* Decorative: its value is the line beside it, which a screen reader reads once. */}
        <ProgressBar value={head.progress.value} max={head.progress.max} fill="accent" decorative />
      </div>
    ) : null;

  const completion = head.completion;
  return (
    // The heading is `MomentPointsHead`'s own (`sr-only`), so the card adds none.
    // `id="points-head"`: a spec scopes to the head, which shares its words with the hub's band.
    <div id="points-head" className="rounded-panel border border-edge bg-surface p-4">
      <PointsHeadGate
        heading={t("heading")}
        balanceLabel={t("balanceLabel")}
        total={head.totalPoints}
        completion={completion ? { occurrenceId: completion.occurrenceId, from: completion.from, fromProgress: completion.fromProgress } : null}
        delta={completion ? `+${formatNumber(completion.delta)}` : null}
        deltaLabel={completion ? t("deltaLabel", { count: completion.delta, value: formatNumber(completion.delta) }) : null}
        levelUp={head.levelUp ? { occurrenceId: head.levelUp.occurrenceId } : null}
        streak={null}
        bar={bar}
        card={card}
        needsMark={head.needsMark}
        acknowledge={acknowledge}
        documentLoad={documentLoad}
        layout="row"
      />
    </div>
  );
}
