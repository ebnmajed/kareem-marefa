import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import type { PointsLedgerRow } from "@/lib/dal/points";

// SCR-022's list half. Every row shows its own reason — never a hard-coded
// label standing in for it — because REQ-PTS-003's promise is that a member
// can explain every point without asking anyone, and the reason column is
// the explanation (05 §8). A reversal or a manual adjustment gets a small
// tag alongside its own reason, not instead of it.
export async function PointsHistoryList({ rows, timeZone }: { rows: PointsLedgerRow[]; timeZone: string }) {
  const t = await getTranslations("scoring.points");

  if (rows.length === 0) {
    return <p className="mt-6 rounded-field border border-edge p-4 text-body text-fg-muted">{t("empty")}</p>;
  }

  return (
    <ul className="mt-6 space-y-3">
      {rows.map((row) => {
        const sign = row.amount > 0 ? "+" : "";
        return (
          <li key={row.id} className="rounded-field border border-edge p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-label text-fg-heading">
                <bdi>{row.reason}</bdi>
              </p>
              <p className="shrink-0 text-label text-fg-heading">
                <bdi>
                  {sign}
                  {formatNumber(row.amount)}
                </bdi>
              </p>
            </div>
            {row.isReversal ? <p className="mt-1 text-body-sm text-fg-muted">{t("row.reversal")}</p> : null}
            {row.isManualAdjustment ? <p className="mt-1 text-body-sm text-fg-muted">{t("row.manual")}</p> : null}
            <p className="mt-1 text-body-sm text-fg-muted">{formatDateTime(row.occurredAt, timeZone)}</p>
            {row.sessionId && row.sessionTitle ? (
              <p className="mt-1 text-body-sm text-fg-muted">
                <bdi>{row.sessionTitle}</bdi>
                {" · "}
                <Link href={`/app/sessions/${row.sessionId}`} className="underline underline-offset-4 hover:text-fg-heading">
                  {t("row.openSession")}
                </Link>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
