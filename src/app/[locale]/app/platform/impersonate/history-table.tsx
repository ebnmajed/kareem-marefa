"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
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
  const when = (iso: string) => formatDateTime(iso, PLATFORM_TIME_ZONE, locale);
  const minutes = (s: ImpersonationSession) => Math.round((Date.parse(s.expiresAt) - Date.parse(s.startedAt)) / 60000);

  const columns: DataTableColumn<ImpersonationSession>[] = [
    { key: "started", header: t("whenColumn"), cell: (s) => <bdi>{when(s.startedAt)}</bdi> },
    { key: "org", header: t("orgColumn"), onCard: true, cell: (s) => <bdi>{s.orgName}</bdi> },
    { key: "reason", header: t("reasonColumn"), onCard: true, cell: (s) => <bdi>{s.reason}</bdi> },
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
      key: "end",
      header: t("endColumn"),
      onCard: true,
      cell: (s) => <bdi>{when(s.endedBy === "stopped" && s.endedAt ? s.endedAt : s.expiresAt)}</bdi>,
    },
    {
      key: "state",
      header: t("stateColumn"),
      onCard: true,
      cell: (s) =>
        s.endedBy === null ? (
          <Badge tone="live">{t("stateOpen")}</Badge>
        ) : s.endedBy === "stopped" ? (
          <Badge tone="ended">{t("stateStopped")}</Badge>
        ) : (
          <Badge tone="ended" outline>
            {t("stateExpired")}
          </Badge>
        ),
    },
  ];

  return (
    <DataTable
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
