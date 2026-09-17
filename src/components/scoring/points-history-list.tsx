import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { dayShortLabel } from "@/components/sessions/day-label";
import type { MissedAttendance, PointsLedgerRow } from "@/lib/dal/points";

// SCR-022's list half. Every row shows its own reason — never a hard-coded
// label standing in for it — because REQ-PTS-003's promise is that a member
// can explain every point without asking anyone, and the reason column is
// the explanation (05 §8). A reversal or a manual adjustment gets a small
// tag alongside its own reason, not instead of it — including `checkin`'s
// REQ-CHK-017 removal, which is `isReversal` off the same `source` column
// as every other reversal (`lib/dal/points.ts`'s own header).
// ★ REQ-SES-017 — «the member can see why». A multi-day session whose days
// were not all attended pays nothing, and NOTHING IS WRITTEN: the ledger
// records points, not explanations. So the history interleaves a notice, by
// the session's completion time, saying which day was missed. It is not a
// ledger row and carries no amount, which is also how it reads.
//
// `missed` is empty for every one-day session, so a one-day history renders
// exactly as it did before this existed.
export async function PointsHistoryList({
  rows,
  missed = [],
  timeZone,
  locale = "ar",
}: {
  rows: PointsLedgerRow[];
  missed?: MissedAttendance[];
  timeZone: string;
  locale?: string;
}) {
  const t = await getTranslations("scoring.points");
  const td = await getTranslations("sessions.days");

  // One entry stream, newest first. A ledger row sits at its own instant; a
  // notice sits at the session's completion, which is when the award it is
  // explaining would have arrived.
  type Entry =
    | { at: string; kind: "ledger"; row: PointsLedgerRow }
    | { at: string; kind: "missed"; notice: MissedAttendance };
  const entries: Entry[] = [
    ...rows.map((row): Entry => ({ at: row.occurredAt, kind: "ledger", row })),
    ...missed.map((notice): Entry => ({ at: notice.completedAt, kind: "missed", notice })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  // «اليوم الثاني واليوم الثالث» — the locale's own conjunction, not a glued
  // separator string, so «and» never has to be translated by hand.
  const joiner = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });

  if (entries.length === 0) {
    // ★ REQ-UIX-012 — every empty state names the next action. A member
    // with no points yet earns their first one by attending, so the
    // action is the same "browse sessions" the certificates and calendar
    // empty states use.
    return <EmptyState title={t("empty")} action={{ label: t("browseAction"), href: "/app/sessions" }} className="mt-6" />;
  }

  return (
    <ul className="mt-6 space-y-3">
      {entries.map((entry) => {
        if (entry.kind === "missed") {
          const { notice } = entry;
          const days = joiner.format(notice.days.map((day) => dayShortLabel(day, td)));
          return (
            <li key={`missed-${notice.sessionId}`}>
              {/* `ended`, not `error`: the member did nothing wrong, and an
                  error tone would say they did. No amount, because no points
                  moved — the absence of a number IS the fact. */}
              <Panel tone="ended" className="p-4">
                <p className="text-label text-fg-heading">{t("row.missed.title")}</p>
                <div className="mt-2">
                  <Badge tone="ended" size="sm">
                    {t("row.missed.days", { count: notice.days.length, days })}
                  </Badge>
                </div>
                <p className="mt-2 text-body-sm text-fg-muted">{t("row.missed.rule")}</p>
                <p className="mt-2 text-body-sm text-fg-muted">{formatDateTime(notice.completedAt, timeZone)}</p>
                <p className="mt-1 text-body-sm text-fg-muted">
                  <bdi>{notice.sessionTitle}</bdi>
                  {" · "}
                  <Link href={`/app/sessions/${notice.sessionId}`} className="underline underline-offset-4 hover:text-fg-heading">
                    {t("row.openSession")}
                  </Link>
                </p>
              </Panel>
            </li>
          );
        }
        const { row } = entry;
        const sign = row.amount > 0 ? "+" : "";
        return (
          <li key={row.id}>
            <Panel className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-label text-fg-heading">
                  <bdi>{row.reason}</bdi>
                </p>
                <p className="shrink-0 text-label text-fg-heading">
                  {/* `dir="ltr"`, not just `<bdi>`: pinned deliberately, not
                      because a reorder was observed here — a sync-5 finding
                      of the sign landing after the digits turned out to be a
                      misread of a downscaled capture (a bare `<bdi>` in
                      Chromium already puts the sign before the digits). The
                      isolate stays either way; `dir="ltr"` just states
                      outright what should already be true — Western digits
                      and their sign always read left to right regardless of
                      the surrounding Arabic — rather than leaving it to a
                      bidi algorithm's default resolution. */}
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
