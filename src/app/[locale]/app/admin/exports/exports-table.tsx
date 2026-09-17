"use client";

import { useTranslations } from "next-intl";
import { ExportDownloadButton } from "@/components/admin/export-download-button";
import { formatDateTime } from "@/components/sessions/numerals";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import type { ExportType, RecentExport } from "@/lib/dal/admin-exports";

// SCR-061's seven exports on `ui/data-table` — the file and what it holds, who
// took it last and when, and the download. Every column is on the phone card,
// the download included.

export interface ExportRow {
  type: ExportType;
  last: RecentExport | null;
}

export function ExportsTable({ rows, timeZone, locale }: { rows: ExportRow[]; timeZone: string; locale: string }) {
  const t = useTranslations("admin.exports");
  const plain = (chunks: string) => chunks;

  const columns: DataTableColumn<ExportRow>[] = [
    {
      key: "export",
      header: t("colExport"),
      onCard: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-label text-fg-heading">{t(`${r.type}.title`)}</p>
          <p className="mt-0.5 text-body-sm text-fg-muted">{t(`${r.type}.note`)}</p>
        </div>
      ),
    },
    {
      key: "last",
      header: t("colLast"),
      onCard: true,
      cell: (r) =>
        r.last ? (
          <span>
            {t.rich("lastExport", {
              name: r.last.actorName ?? t("unknownActor"),
              when: formatDateTime(r.last.occurredAt, timeZone, locale),
              t: (chunks) => <bdi>{chunks}</bdi>,
              bdi: (chunks) => <bdi>{chunks}</bdi>,
            })}
          </span>
        ) : (
          <span className="text-fg-muted">{t("neverExported")}</span>
        ),
    },
    {
      key: "download",
      header: t("colDownload"),
      onCard: true,
      cell: (r) => {
        const name = t(`${r.type}.title`);
        return (
          <ExportDownloadButton
            href={`/api/admin/exports/${r.type}`}
            fallbackName={`${r.type}.csv`}
            label={t("download")}
            accessibleName={t.markup("downloadLabel", { name, t: plain })}
            pendingLabel={t("downloading")}
            doneLabel={t.markup("downloaded", { name, t: plain })}
            failedLabel={t.markup("downloadFailed", { name, t: plain })}
          />
        );
      },
    },
  ];

  return (
    <DataTable
      label={t("listLabel")}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.type}
      empty={{ title: t("empty"), action: { label: t("auditLink"), href: "/app/admin/audit?action=export.created" } }}
    />
  );
}
