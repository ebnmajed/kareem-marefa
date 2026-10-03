"use client";

import { useTranslations } from "next-intl";
import { relativeWhen, whenWords } from "@/components/scoring/relative-when";
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

export function HistoryTable({ rows, timeZone, locale, now }: { rows: HistoryDisplayRow[]; timeZone: string; locale: string; now: string }) {
  const t = useTranslations("scoring.admin.history");
  const tr = useTranslations("scoring.admin.read");
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
    { key: "when", header: t("colWhen"), onCard: true, cell: (r) => (
        // A relative day and the time, as the boards draw them; the instant itself for a machine.
        <time dateTime={r.changedAt} className="whitespace-nowrap">
          {whenWords((k, v) => tr.markup(k as never, v as never), "when", relativeWhen(r.changedAt, now, timeZone, locale))}
        </time>
      ),
    },
  ];
  return (
    <DataTable
      className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1"
      label={t("listLabel")}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      empty={{ title: t("empty"), action: { label: t("emptyAction"), href: "/app/admin/scoring#catalogue-heading" } }}
    />
  );
}
