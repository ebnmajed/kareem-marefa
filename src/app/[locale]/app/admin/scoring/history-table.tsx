"use client";

import { useTranslations } from "next-intl";
import { formatDateTime } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";

// REQ-PTS-005: «every change records who, when, old value and new value … the
// history is readable in the admin console and is immutable». It showed a raw
// field name and two JSON values, no rule and no author, in a hard-coded zone,
// and a «version» change on every save. Each row now names the rule, the
// field, the change in words and who made it; the page formats the values.

export interface HistoryDisplayRow {
  id: string;
  rule: string;
  field: string;
  from: string;
  to: string;
  who: string;
  changedAt: string;
}

export function HistoryTable({ rows, timeZone, locale }: { rows: HistoryDisplayRow[]; timeZone: string; locale: string }) {
  const t = useTranslations("scoring.admin.history");
  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  const columns: DataTableColumn<HistoryDisplayRow>[] = [
    {
      key: "rule",
      header: t("colRule"),
      onCard: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-label text-fg-heading">{r.rule}</p>
          <p className="mt-0.5 text-caption text-fg-muted">{r.field}</p>
        </div>
      ),
    },
    { key: "change", header: t("colChange"), onCard: true, cell: (r) => <span>{t.rich("change", { from: r.from, to: r.to, bdi })}</span> },
    { key: "who", header: t("colWho"), onCard: true, cell: (r) => <bdi>{r.who}</bdi> },
    { key: "when", header: t("colWhen"), onCard: true, cell: (r) => <bdi>{formatDateTime(r.changedAt, timeZone, locale)}</bdi> },
  ];
  return (
    <DataTable
      label={t("listLabel")}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      empty={{ title: t("empty"), action: { label: t("emptyAction"), href: "/app/admin/scoring#catalogue-heading" } }}
    />
  );
}
