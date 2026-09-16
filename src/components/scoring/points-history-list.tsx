import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { PointsLedgerRow } from "@/lib/dal/points";

// SCR-022's list half. Every row shows its own reason — never a hard-coded
// label standing in for it — because REQ-PTS-003's promise is that a member
// can explain every point without asking anyone, and the reason column is
// the explanation (05 §8). A reversal or a manual adjustment gets a small
// tag alongside its own reason, not instead of it — including `checkin`'s
// REQ-CHK-017 removal, which is `isReversal` off the same `source` column
// as every other reversal (`lib/dal/points.ts`'s own header).
export async function PointsHistoryList({ rows, timeZone }: { rows: PointsLedgerRow[]; timeZone: string }) {
  const t = await getTranslations("scoring.points");

  if (rows.length === 0) {
    // ★ REQ-UIX-012 — every empty state names the next action. A member
    // with no points yet earns their first one by attending, so the
    // action is the same "browse sessions" the certificates and calendar
    // empty states use.
    return <EmptyState title={t("empty")} action={{ label: t("browseAction"), href: "/app/sessions" }} className="mt-6" />;
  }

  return (
    <ul className="mt-6 space-y-3">
      {rows.map((row) => {
        const sign = row.amount > 0 ? "+" : "";
        return (
          <li key={row.id}>
            <Panel className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-label text-fg-heading">
                  <bdi>{row.reason}</bdi>
                </p>
                <p className="shrink-0 text-label text-fg-heading">
                  {/* `dir="ltr"`, not just `<bdi>`: `formatNumber` (sessions'
                      numerals.ts) drops ICU's LRM, so a negative amount's own
                      "-" — or this "+" — resolves RTL inside a bare bdi and
                      lands AFTER the digits ("20-" instead of "-20"). The
                      isolate stays; only its direction is pinned, because
                      Western digits and their sign always read left to right
                      regardless of the surrounding Arabic. */}
                  <bdi dir="ltr">
                    {sign}
                    {formatNumber(row.amount)}
                  </bdi>
                </p>
              </div>
              {row.isReversal || row.isManualAdjustment ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.isReversal ? (
                    <Badge tone="info" size="sm">
                      {t("row.reversal")}
                    </Badge>
                  ) : null}
                  {row.isManualAdjustment ? (
                    <Badge tone="info" size="sm">
                      {t("row.manual")}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-2 text-body-sm text-fg-muted">{formatDateTime(row.occurredAt, timeZone)}</p>
              {row.sessionId && row.sessionTitle ? (
                <p className="mt-1 text-body-sm text-fg-muted">
                  <bdi>{row.sessionTitle}</bdi>
                  {" · "}
                  <Link href={`/app/sessions/${row.sessionId}`} className="underline underline-offset-4 hover:text-fg-heading">
                    {t("row.openSession")}
                  </Link>
                </p>
              ) : null}
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
