"use client";

import { useTranslations } from "next-intl";
import { ExportDownloadButton } from "@/components/admin/export-download-button";
import { formatDateTime } from "@/components/sessions/numerals";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import type { ExportType, RecentExport } from "@/lib/dal/admin-exports";

// SCR-061's table, written for wave 22 from `AdminExports.dc.html` (`DEC-208`: deleted first): التصدير · آخر مرة ·
// «CSV». One row per export — the seven of `REQ-ADM-017` and the audit log's, a new type through the same audited path
// (`REQ-UIX-099`). ★ «آخر مرة» is read from the `export.created` row the download wrote: who and when, never a
// literal (`REQ-UIX-098`). The download stays `ExportDownloadButton` — it fetches, names the file, toasts either way and
// refreshes, so the row shows the export that just happened.

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
          {/* `REQ-UIX-098`: what each file holds — one line, under the name. */}
          <p className="mt-0.5 text-caption text-fg-muted">{t(`${r.type}.note`)}</p>
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
      align: "end",
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
      stickyHeader
      hiddenHeaders={["download"]}
      label={t("listLabel")}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.type}
      empty={{ title: t("empty"), action: { label: t("auditLink"), href: "/app/admin/audit?action=export.created" } }}
    />
  );
}
