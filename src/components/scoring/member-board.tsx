import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { BoardRankCard, type BoardPlaceView } from "@/components/scoring/board-rank-card";
import { MomentRank } from "@/components/scoring/moment-rank";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/components/ui/link";
import { Podium } from "@/components/ui/podium";
import { RankRow } from "@/components/ui/rank-row";
import type { BoardMoment, MemberBoardRow } from "@/lib/dal/leaderboards";

// SCR-027's member board — `Board.dc.html`, `M10c.md` §7 (wave 20, REQ-UIX-078, REQ-LDR-001, REQ-LDR-008). Written
// from the artboard after the old file was deleted (DEC-208); scoring's for the wave, `sessions'` again after it.
//
// In the artboard's order: «ترتيبك» (always), the podium for the first three (static), `rank-row`s 4 – 10 with the
// viewer's row in place, the viewer's row pinned after them when it is further down, and «عرض 11 إلى 50».
//
// ★ REQ-LDR-001: the viewer's own rank is always visible — the card, and the row wherever it falls. REQ-LDR-008: an
// opted-out member's row is absent for everyone else, by the database (`all_time_leaderboard()`, `boards_read`,
// `weekly_leaderboard()`); this draws what it is given.
// ★ Initials in the team ring, never a photograph (DEC-099, DEC-183 §3), on the podium and the rows alike. A name links
// to the member's profile. Only the viewer's RISE draws an arrow — other members' movement is not recorded anywhere
// (the seen marks are the viewer's own) and a fall never draws one (REQ-UIX-037).
// ★ Moment 5 (DEC-218 §3.4): one claim, two parts — the card's figure counts, and the rows FLIP — once per change,
// through `MomentRank`, keyed as before. The podium never moves.

const PODIUM = 3;
export const BOARD_SHOWN = 10;
export const BOARD_MORE = 50;

export async function MemberBoard({
  rows,
  place,
  windowLabel,
  optedOut,
  limit = BOARD_SHOWN,
  moreHref = null,
  moment = null,
  acknowledge = null,
  documentLoad = false,
}: {
  rows: MemberBoardRow[];
  place: BoardPlaceView | null;
  windowLabel: string;
  optedOut: boolean;
  limit?: number;
  /** «عرض 11 إلى 50» — the same window with more rows; null when every row is shown. */
  moreHref?: string | null;
  moment?: BoardMoment | null;
  acknowledge?: (() => Promise<void>) | null;
  documentLoad?: boolean;
}) {
  const t = await getTranslations("leaderboards");
  const seenRank = moment?.seenRank ?? null;

  // Awaited here rather than nested as an element, so the card renders in the same pass as the board.
  const card = await BoardRankCard({ place, windowLabel, optedOut, seenRank });

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {card}
        <EmptyState size="sm" title={t("empty")} action={{ label: t("emptyAction"), href: "/app/sessions" }} />
      </div>
    );
  }

  const top = rows.slice(0, PODIUM);
  const listed = rows.slice(PODIUM, limit);
  const self = rows.find((r) => r.isSelf) ?? null;
  const selfBelow = self && !rows.slice(0, limit).includes(self) ? self : null;
  const selfIndex = self ? listed.indexOf(self) : -1;
  const index = selfIndex >= 0 ? selfIndex : null;
  const passed = seenRank !== null && self ? Math.max(0, seenRank - self.rank) : 0;

  const row = (r: MemberBoardRow) => (
    <RankRow
      key={r.memberId}
      rank={r.rank}
      rankLabel={t.markup("rankValue", { value: formatNumber(r.rank), bdi: (chunks) => chunks })}
      memberId={r.memberId}
      displayName={r.displayName}
      company={r.company ?? null}
      teamColor={r.teamColor ?? null}
      points={formatNumber(r.points)}
      pointsLabel={t("pointsValue", { count: r.points, value: formatNumber(r.points) })}
      selfLabel={r.isSelf ? t("you") : null}
      movement={r.isSelf && seenRank !== null ? { previousRank: seenRank, riseLabel: t("riseLabel", { count: seenRank - r.rank, value: formatNumber(seenRank - r.rank) }) } : null}
      href={`/app/members/${r.memberId}`}
    />
  );

  const board = (
    <div className="flex flex-col gap-4">
      {card}
      <Podium
        label={t("podium.label")}
        places={top.map((r) => ({
          rank: r.rank,
          rankLabel: t.markup("rankValue", { value: formatNumber(r.rank), bdi: (chunks) => chunks }),
          memberId: r.memberId,
          displayName: r.displayName,
          company: r.company ?? null,
          teamColor: r.teamColor ?? null,
          points: formatNumber(r.points),
          pointsLabel: t("pointsValue", { count: r.points, value: formatNumber(r.points) }),
          href: `/app/members/${r.memberId}`,
          selfLabel: r.isSelf ? t("you") : null,
        }))}
      />
      {listed.length > 0 ? (
        <ul data-slot="board-rows" className="flex flex-col gap-2 border-t border-edge pt-4">
          {listed.map(row)}
        </ul>
      ) : null}
      {selfBelow ? (
        <section aria-labelledby="board-self" className="flex flex-col gap-2 border-t border-edge pt-4">
          <h3 id="board-self" className="text-label text-fg-muted">
            {t("selfHeading")}
          </h3>
          <ul className="flex flex-col gap-2">{row(selfBelow)}</ul>
        </section>
      ) : null}
      {moreHref ? (
        <Link href={moreHref} className="self-center py-1 text-caption text-fg-muted underline-offset-4 hover:underline">
          {t.rich("more", { from: formatNumber(limit + 1), to: formatNumber(BOARD_MORE), count: rows.length, value: formatNumber(rows.length), bdi: (c) => <bdi>{c}</bdi> })}
        </Link>
      ) : null}
    </div>
  );

  return acknowledge ? (
    <MomentRank
      occurrenceId={moment?.occurrenceId ?? null}
      index={index}
      passed={passed}
      fromFraction={null}
      needsMark={moment?.needsMark ?? false}
      acknowledge={acknowledge}
      documentLoad={documentLoad}
      count={place && moment?.occurrenceId && seenRank !== null && seenRank > place.rank ? { from: seenRank, to: place.rank } : null}
      listSelector="[data-slot=board-rows]"
    >
      {board}
    </MomentRank>
  ) : (
    board
  );
}
