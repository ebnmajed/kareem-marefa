"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import { formatDateTime, formatNumber, formatTime } from "@/components/sessions/numerals";
import type { ImpersonationSession } from "@/lib/dal/platform";

// SCR-085's «السجل» — the CALLER'S OWN sessions (`platform_impersonations()` filters on `auth.uid()`), on
// `ui/data-table`: a card list below `md`. `PlatformImpersonate.dc.html` draws متى · المؤسسة · العضو · السبب · المدة;
// ★ there is no «العضو» (DEC-251, Q1 — a session names no member), and the state and the end are kept (I8).
//
// «المدة» is the duration the session was GRANTED — its own `expires_at − started_at`, read from the row and never a
// second store. A written reason is what the org's admins read in their own log, so it is shown back verbatim,
// bidi-isolated; cells wrap, never truncate. The state badge is SCR-085's three states in the status vocabulary: open
// is `live`, a stop is `ended`, an expiry is `ended` in outline — the difference an auditor asks about first.

const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export function HistoryTable({ sessions, locale }: { sessions: ImpersonationSession[]; locale: string }) {
  const t = useTranslations("platform.impersonate");
  const full = (iso: string) => formatDateTime(iso, PLATFORM_TIME_ZONE, locale);
  // «22 سبتمبر · 3:12 م» — the board's short form, so a row stays near one line in its half of the page; the full date
  // and weekday ride in the cell's `title`. The time keeps its «م» on its own line (`formatTime`'s no-break space).
  const dayMonth = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: "numeric", month: "long", timeZone: PLATFORM_TIME_ZONE });
  const when = (iso: string) => `${dayMonth.format(new Date(iso))} · ${formatTime(iso, PLATFORM_TIME_ZONE, locale)}`;
  const minutes = (s: ImpersonationSession) => Math.round((Date.parse(s.expiresAt) - Date.parse(s.startedAt)) / 60000);

  // Five columns, as the board draws five: the end sits under the state in one cell, so the log fits its half of the
  // page at 1280 with no horizontal scroller — a read-only table that scrolls sideways is a region a keyboard cannot
  // reach (axe `scrollable-region-focusable`). Free text breaks anywhere rather than widening the table.
  const columns: DataTableColumn<ImpersonationSession>[] = [
    { key: "started", header: t("whenColumn"), cell: (s) => <bdi title={full(s.startedAt)}>{when(s.startedAt)}</bdi> },
    { key: "org", header: t("orgColumn"), onCard: true, cell: (s) => <bdi className="[overflow-wrap:anywhere]">{s.orgName}</bdi> },
    { key: "reason", header: t("reasonColumn"), onCard: true, cell: (s) => <bdi className="[overflow-wrap:anywhere]">{s.reason}</bdi> },
    {
      key: "duration",
      header: t("durationColumn"),
      onCard: true,
      cell: (s) => {
        const n = minutes(s);
        return <bdi>{t("durationShort", { count: n, value: formatNumber(n) })}</bdi>;
      },
    },
    {
      key: "state",
      header: t("stateColumn"),
      onCard: true,
      cell: (s) => (
        <span className="flex flex-col items-start gap-1">
          {s.endedBy === null ? (
            <Badge tone="live">{t("stateOpen")}</Badge>
          ) : s.endedBy === "stopped" ? (
            <Badge tone="ended">{t("stateStopped")}</Badge>
          ) : (
            <Badge tone="ended" outline>
              {t("stateExpired")}
            </Badge>
          )}
          <span className="text-caption text-fg-muted">
            {t("endColumn")}
            {": "}
            <bdi title={full(s.endedBy === "stopped" && s.endedAt ? s.endedAt : s.expiresAt)}>{when(s.endedBy === "stopped" && s.endedAt ? s.endedAt : s.expiresAt)}</bdi>
          </span>
        </span>
      ),
    },
  ];

  return (
    <DataTable
      // The surface card at md+, as every console table since wave 21 draws it; the rows are cards below `md`.
      className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1"
      label={t("logTitle")}
      columns={columns}
      rows={sessions}
      rowKey={(s) => s.id}
      empty={{
        title: t("historyEmpty"),
        action: { label: t("historyEmptyAction"), onClick: () => document.getElementById("orgId")?.focus() },
        size: "sm",
      }}
    />
  );
}
