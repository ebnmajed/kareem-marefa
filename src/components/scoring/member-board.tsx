import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { MomentRank } from "@/components/scoring/moment-rank";
import { EmptyState } from "@/components/ui/empty-state";
import { RankRow } from "@/components/ui/rank-row";
// ★ Wave 17 (DEC-199 §1.3.4): the shell's layout is the scope now and scopes do not nest, so this is a plain element.
import type { BoardMoment, MemberBoardRow } from "@/lib/dal/leaderboards";

// SCR-027's member boards — all-time and this month. On the M9 system in wave 7
// (`sessions`', DEC-137); ★ wave 16 (`scoring`'s for the wave, DEC-195 §1.1,
// REQ-UIX-048): the rows are `rank-row`, inside the playground's scope, and
// moment 5 moves them once when the member's rank ROSE since they last saw it.
//
// ★ REQ-LDR-001: THE MEMBER'S OWN RANK IS ALWAYS VISIBLE, even outside the
// range shown. The board shows the top `limit`; when the viewer is below it,
// their own row follows under «ترتيبك». REQ-LDR-008 means an opted-out
// member's own call is the only one that returns their row.
//
// ★ INITIALS IN THE TEAM RING, NEVER A PHOTOGRAPH (DEC-183 §3, DEC-099,
// REQ-UIX-048): `rank-row` takes no `src`. This replaces `16` §6.8.3's «no
// avatars on a board», which `DEC-183` superseded (D-33 in scoring's note).
// A name still links to the member's profile, and the whole row is the target.
//
// ★ A LEADERBOARD NEVER SHAMES: only a rise draws an arrow, and only a rise is
// a moment. The viewer's row says «أنت» in words and is outlined.
//
// The scope sits around the board's list, the nearest container of the surface
// that is neither transformed, filtered nor clipped — the boards live inside
// `ui/tabs`' panel (DEC-197 §8). An empty board stays outside it, as it was.

const DEFAULT_LIMIT = 20;

export async function MemberBoard({
  rows,
  limit = DEFAULT_LIMIT,
  moment = null,
  acknowledge = null,
  documentLoad = false,
}: {
  rows: MemberBoardRow[];
  limit?: number;
  /** wave 16: what the viewer last saw on this board, from `getBoardMoment()`. */
  moment?: BoardMoment | null;
  /** wave 16: the bound Server Action that records it. */
  acknowledge?: (() => Promise<void>) | null;
  /** wave 16: from `isDocumentLoad()` — a hard load plays nothing. */
  documentLoad?: boolean;
}) {
  const t = await getTranslations("leaderboards");

  if (rows.length === 0) {
    return <EmptyState size="sm" title={t("empty")} action={{ label: t("emptyAction"), href: "/app/sessions" }} />;
  }

  const shown = rows.slice(0, limit);
  const self = rows.find((r) => r.isSelf);
  const selfBelow = self && !shown.includes(self) ? self : null;
  const seenRank = moment?.seenRank ?? null;

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

  const selfIndex = self ? shown.indexOf(self) : -1;
  const board = (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2">{shown.map(row)}</ul>
      {selfBelow ? (
        <section aria-labelledby="board-self" className="flex flex-col gap-2 border-t border-edge pt-4">
          <h3 id="board-self" className="text-label text-fg-muted">
            {t("selfHeading")}
          </h3>
          <ul className="flex flex-col gap-2">{row(selfBelow)}</ul>
        </section>
      ) : null}
    </div>
  );

  return (
    <div className="rounded-panel bg-canvas p-3">
      {acknowledge ? (
        <MomentRank
          occurrenceId={moment?.occurrenceId ?? null}
          index={selfIndex >= 0 ? selfIndex : null}
          passed={seenRank !== null && self ? Math.max(0, seenRank - self.rank) : 0}
          fromFraction={null}
          needsMark={moment?.needsMark ?? false}
          acknowledge={acknowledge}
          documentLoad={documentLoad}
        >
          {board}
        </MomentRank>
      ) : (
        board
      )}
    </div>
  );
}
