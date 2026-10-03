"use client";

import { useTranslations } from "next-intl";
import { splitDuration } from "@/components/admin/duration";
import { formatNumber } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { COOLDOWN_UNITS } from "./state";

// SCR-053 in READ mode — one `data-table` per group, as `AdminScoring.dc.html` draws them: الفعل · القيمة · الحد ·
// التبريد · مفعّل. ★ A read-mode value is TEXT with a glyph, never a control (`DEC-232` §3.4): nothing on this page
// writes before «احفظ». One line per action, as drawn (the lead's ruling on D2): the text a member reads for it
// (`REQ-PTS-003`) is shown and edited in edit mode. Every value is what is STORED — a deduction at 0 that is switched on
// reads «لا خصم» and «✓ مفعّل», and the group's heading claims nothing about it. Columns are built here, in the client,
// because a column's cell is a function and cannot cross from the server page.

export interface CatalogueRow {
  id: string;
  actionKey: string;
  name: string;
  reason: string;
  points: number;
  capPerSession: number | null;
  cooldownSeconds: number | null;
  enabled: boolean;
  penalty: boolean;
}

const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

export function CatalogueTable({ label, rows }: { label: string; rows: CatalogueRow[] }) {
  const t = useTranslations("scoring.admin");

  const value = (r: CatalogueRow) => {
    const n = Math.abs(r.points);
    return t.rich(r.penalty ? "catalogue.cost" : "catalogue.points", { count: n, value: formatNumber(n), bdi });
  };
  const cap = (r: CatalogueRow) => (r.capPerSession === null ? t("read.none") : t.rich("catalogue.cap", { count: r.capPerSession, value: formatNumber(r.capPerSession), bdi }));
  const cooldown = (r: CatalogueRow) => {
    if (!r.cooldownSeconds) return t("read.none");
    const { amount, unit } = splitDuration(r.cooldownSeconds, "seconds", COOLDOWN_UNITS);
    return t.rich(`catalogue.cooldown.${unit}`, { count: amount, value: formatNumber(amount), bdi });
  };

  const columns: DataTableColumn<CatalogueRow>[] = [
    {
      key: "action",
      header: t("read.colAction"),
      onCard: true,
      cell: (r) => <span className="text-fg-heading">{r.name}</span>,
    },
    { key: "value", header: t("read.colValue"), onCard: true, cell: value },
    { key: "cap", header: t("read.colCap"), onCard: true, cell: cap },
    { key: "cooldown", header: t("read.colCooldown"), onCard: true, cell: cooldown },
    {
      key: "enabled",
      header: t("read.colEnabled"),
      onCard: true,
      cell: (r) => (
        <span className={`whitespace-nowrap ${r.enabled ? "text-fg-heading" : "text-fg-muted"}`}>
          <span aria-hidden="true">{r.enabled ? "✓ " : "— "}</span>
          {r.enabled ? t("read.on") : t("read.off")}
        </span>
      ),
    },
  ];

  return <DataTable className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1" label={label} columns={columns} rows={rows} rowKey={(r) => r.id} empty={{ title: t("catalogue.empty"), action: { label: t("catalogue.emptyAction"), href: "/app/admin/scoring#history-heading" } }} />;
}
