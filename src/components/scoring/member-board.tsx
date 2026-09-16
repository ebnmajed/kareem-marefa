import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { MemberBoardRow } from "@/lib/dal/leaderboards";

// SCR-027's per-member board half (all-time and monthly). The viewer's own
// row is marked, never singled out visually in a way that reads as a
// medal or a callout — REQ-LDR-008 lets a member see their own rank even
// when everyone else on the board is hidden from them by opt-out, so this
// component must render correctly with as few as one row.
export async function MemberBoard({ rows }: { rows: MemberBoardRow[]; }) {
  const t = await getTranslations("leaderboards");

  if (rows.length === 0) {
    return <p className="mt-4 rounded-field border border-edge p-4 text-body text-fg-muted">{t("empty")}</p>;
  }

  return (
    <ol className="mt-4 space-y-2">
      {rows.map((row) => (
        <li
          key={row.memberId}
          className={`flex items-center justify-between gap-3 rounded-field border p-3 ${row.isSelf ? "border-edge-strong bg-silver-100" : "border-edge"}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-label text-fg-muted">
              <bdi>{formatNumber(row.rank)}</bdi>
            </span>
            <span className="text-body text-fg-heading">
              <bdi>{row.displayName}</bdi>
              {row.isSelf ? <span className="text-body-sm text-fg-muted"> — {t("you")}</span> : null}
            </span>
          </div>
          <span className="text-label text-fg-heading">{t("pointsValue", { count: row.points, value: formatNumber(row.points) })}</span>
        </li>
      ))}
    </ol>
  );
}
