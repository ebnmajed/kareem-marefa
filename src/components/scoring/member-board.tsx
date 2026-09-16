import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/components/ui/link";
import type { MemberBoardRow } from "@/lib/dal/leaderboards";

// SCR-027's member boards — all-time and this month — on the M9 system for
// wave 7 (`sessions`' this wave, DEC-137).
//
// ★ REQ-LDR-001: THE MEMBER'S OWN RANK IS ALWAYS VISIBLE, even outside the
// range shown. The board shows the top `limit`; when the viewer is below it,
// their own row follows under «ترتيبك». Presentation only — the rows already
// carry them, and REQ-LDR-008 means an opted-out member's own call is the only
// one that returns their row, so this renders correctly with a single row.
//
// ★ NO AVATARS (DEC-099, `16` §6.8.3): ranking by face invites a comparison
// the product does not want. A name links to the member's profile instead.
//
// The viewer's row is marked «أنت» — a word, not a medal or a callout colour.

const DEFAULT_LIMIT = 20;

function Row({ row, you, rankLabel, points }: { row: MemberBoardRow; you: string; rankLabel: string; points: string }) {
  return (
    <li className={`flex items-center gap-3 rounded-card border px-4 py-3 ${row.isSelf ? "border-edge-strong bg-silver-100" : "border-edge bg-surface"}`}>
      <span className="w-9 shrink-0 text-center text-label text-fg-muted">
        <span className="sr-only">{rankLabel}</span>
        <span aria-hidden>{formatNumber(row.rank)}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Link href={`/app/members/${row.memberId}`} className="text-body text-fg-heading underline-offset-4 hover:underline">
          <bdi>{row.displayName}</bdi>
        </Link>
        {row.isSelf ? (
          <Badge tone="info" size="sm">
            {you}
          </Badge>
        ) : null}
      </span>
      <span className="shrink-0 text-label text-fg-heading">{points}</span>
    </li>
  );
}

export async function MemberBoard({ rows, limit = DEFAULT_LIMIT }: { rows: MemberBoardRow[]; limit?: number }) {
  const t = await getTranslations("leaderboards");

  if (rows.length === 0) {
    return <EmptyState size="sm" title={t("empty")} action={{ label: t("emptyAction"), href: "/app/sessions" }} />;
  }

  const shown = rows.slice(0, limit);
  const self = rows.find((r) => r.isSelf);
  const selfBelow = self && !shown.includes(self) ? self : null;
  const row = (r: MemberBoardRow) => (
    <Row
      key={r.memberId}
      row={r}
      you={t("you")}
      rankLabel={t.markup("rankValue", { value: formatNumber(r.rank), bdi: (chunks) => chunks })}
      points={t("pointsValue", { count: r.points, value: formatNumber(r.points) })}
    />
  );

  return (
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
}
