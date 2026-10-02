"use client";

import { useTranslations } from "next-intl";
import { SessionStatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import { PresenterCell, SeatsCell, WhenCell } from "@/components/admin/sessions/cells";
import type { ConsoleSessionRow } from "@/components/admin/sessions/session-query";

// SCR-040's «القادمة» (`AdminDashboard.dc.html`): the next sessions on
// `data-table`, each row a link to its hub (`DEC-178`'s redirect lands on the
// tab the role reads). The rows are SCR-042's own, so the two screens cannot
// draw a session two ways. A client module only because `data-table` is one.
export function UpcomingTable({ rows, timeZone, locale }: { rows: ConsoleSessionRow[]; timeZone: string; locale: string }) {
  const t = useTranslations("admin.dashboard.upcoming");
  const ts = useTranslations("admin.sessions");

  const columns: DataTableColumn<ConsoleSessionRow>[] = [
    {
      key: "title",
      header: t("columnSession"),
      onCard: true,
      cell: (s) => (
        <span className="text-label text-fg-heading">
          <bdi>{s.title}</bdi>
        </span>
      ),
    },
    { key: "start", header: ts("columnStart"), onCard: true, cell: (s) => <WhenCell row={s} timeZone={timeZone} locale={locale} /> },
    { key: "presenter", header: ts("columnPresenter"), onCard: true, cell: (s) => <PresenterCell row={s} /> },
    { key: "seats", header: ts("columnSeats"), onCard: true, cell: (s) => <SeatsCell row={s} /> },
    { key: "status", header: ts("columnStatus"), onCard: true, cell: (s) => <SessionStatusBadge phase={s.phase} seat={s.seat} size="sm" /> },
  ];

  return (
    <DataTable
      label={t("title")}
      columns={columns}
      rows={rows}
      rowKey={(s) => s.id}
      rowHref={(s) => `/app/admin/sessions/${s.id}`}
      empty={{ title: t("empty"), action: { label: t("newSession"), href: "/app/admin/sessions?new=1#new-session" }, size: "sm" }}
    />
  );
}
