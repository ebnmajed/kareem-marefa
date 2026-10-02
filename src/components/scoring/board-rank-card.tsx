import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { RankFigure } from "@/components/scoring/moment-rank";
import { ArrowIcon } from "@/components/ui/icons";

// «ترتيبك» — SCR-027's rank card (`Board.dc.html`, `M10c.md` §7; wave 20, REQ-UIX-078, REQ-LDR-001). scoring's file.
//
// ★ ALWAYS VISIBLE (REQ-LDR-001): the viewer's rank in the display face, the rise since their last visit to THIS
// window, the member just above and the gap, and the window's points. Not ranked is said in words — never a zero
// rank. An opted-out member sees their own rank and is told nobody else does (REQ-LDR-008).
//
// ★ Moment 5's figure (DEC-218 §3.4): the card's rank counts from the rank last seen through `RankFigure`, and its
// arrow (`data-slot="rise"`) fades in, in the same moment as the rows' FLIP — `MomentRank` runs both. The arrow is
// shown in the static state and never pulses (DEC-197 §2). A fall is not an occurrence: no arrow, nothing moves.

export interface BoardPlaceView {
  rank: number;
  points: number;
  above: { displayName: string; gap: number } | null;
}

export async function BoardRankCard({
  place,
  windowLabel,
  optedOut,
  seenRank,
}: {
  place: BoardPlaceView | null;
  /** «هذا الأسبوع» — what the points are counted over. */
  windowLabel: string;
  optedOut: boolean;
  /** The rank last seen, when it was worse — the rise is drawn from it. */
  seenRank: number | null;
}) {
  const t = await getTranslations("leaderboards");
  const rose = place && seenRank !== null && seenRank > place.rank ? seenRank - place.rank : 0;

  return (
    <section data-slot="rank-card" aria-labelledby="rank-card-label" className="flex items-center gap-4 rounded-panel border-2 border-accent bg-surface px-4 py-3 pg-light:border-fg-heading">
      <div className="flex shrink-0 flex-col leading-none">
        <span id="rank-card-label" className="text-caption font-bold text-fg-muted">
          {t("rankCard.label")}
        </span>
        {place ? (
          <span data-slot="rank" className="font-display text-play-lg font-extrabold text-accent pg-light:text-fg-heading">
            <span className="sr-only">{t.markup("rankValue", { value: formatNumber(place.rank), bdi: (c) => c })}</span>
            <bdi dir="ltr" aria-hidden="true">
              <RankFigure prefix="#" text={`#${formatNumber(place.rank)}`} />
            </bdi>
          </span>
        ) : (
          <span className="mt-1 text-body font-bold text-fg-body">{t("rankCard.absent")}</span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-body-sm text-fg-muted">
        {rose > 0 ? (
          <span data-slot="rise" className="inline-flex items-center gap-1 font-bold text-accent pg-light:text-fg-heading">
            <ArrowIcon direction="up" />
            <bdi aria-hidden="true">{formatNumber(rose)}</bdi>
            <span className="sr-only">{t("riseLabel", { count: rose, value: formatNumber(rose) })}</span>
          </span>
        ) : null}
        {place ? (
          place.above ? (
            <span>
              {t.rich("rankCard.above", {
                name: place.above.displayName,
                gap: formatNumber(place.above.gap),
                b: (c) => <b className="text-fg-body">{c}</b>,
                n: (c) => <span dir="ltr">{c}</span>,
                bdi: (c) => <bdi>{c}</bdi>,
              })}
            </span>
          ) : (
            <span className="font-bold text-fg-body">{t("rankCard.first")}</span>
          )
        ) : null}
        {optedOut ? <span>{t("rankCard.hidden")}</span> : null}
      </div>

      {place ? (
        <div className="shrink-0 text-end leading-tight">
          <span className="block font-display text-play-sm font-extrabold text-fg-heading">
            <span className="sr-only">{t("pointsValue", { count: place.points, value: formatNumber(place.points) })}</span>
            <bdi dir="ltr" aria-hidden="true">
              {formatNumber(place.points)}
            </bdi>
          </span>
          <span className="text-caption text-fg-muted">{windowLabel}</span>
        </div>
      ) : null}
    </section>
  );
}
