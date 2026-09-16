"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import { formatDateTime } from "@/components/sessions/numerals";
import type { ImpersonationSession } from "@/lib/dal/platform";

// SCR-085's history — the CALLER'S OWN sessions (`platform_impersonations()`
// filters on `auth.uid()`), on `ui/data-table`: a card list below `md`.
//
// A written reason is what the org's admins read in their own log, so it is
// shown back verbatim, bidi-isolated. The state badge is SCR-085's three states
// in the status vocabulary: open is `live`, a stop is `ended`, an expiry is
// `ended` in outline — the difference an auditor asks about first.

const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export function HistoryTable({ sessions, locale }: { sessions: ImpersonationSession[]; locale: string }) {
  const t = useTranslations("platform.impersonate");
  const when = (iso: string) => formatDateTime(iso, PLATFORM_TIME_ZONE, locale);

  const columns: DataTableColumn<ImpersonationSession>[] = [
    {
      key: "org",
      header: t("orgColumn"),
      cell: (s) => <bdi>{s.orgName}</bdi>,
    },
    {
      key: "reason",
      header: t("reasonColumn"),
      onCard: true,
      cell: (s) => <bdi>{s.reason}</bdi>,
    },
    {
      key: "started",
      header: t("startedColumn"),
      onCard: true,
      cell: (s) => <bdi>{when(s.startedAt)}</bdi>,
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
      label={t("historyTitle")}
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
