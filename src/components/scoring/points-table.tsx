"use client";

import type { DataTableColumn } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { Link } from "@/components/ui/link";

// SCR-022 on desktop — `HubDesktop.dc.html`: the ledger as `data-table`, التاريخ · النقاط · السبب · الجلسة (wave 20,
// REQ-UIX-072, DEC-216 §5.9). scoring's file. A client component because `data-table` is one; the rows arrive as
// plain, already-worded data from `points-ledger.tsx`, so no function crosses the server boundary (DEC-159).
//
// ★ A reversal is two rows (DEC-216 §5.9): the compensating row, «(يلغي سطر <date>)» in its reason, and the reversed
// row struck and muted beneath it. A cap explanation is a muted row with `0`; a missed-day notice a muted row with no
// figure. A loss is coral AND carries its minus; the figure sits in `<bdi dir="ltr">`, sign first.

export interface PointsTableRow {
  key: string;
  date: string;
  figure: string;
  figureLabel: string;
  tone: "gain" | "loss" | "none";
  reason: string;
  session: { href: string; title: string } | null;
  look: "plain" | "struck" | "muted";
}

const TONE = { gain: "text-accent pg-light:text-fg-heading", loss: "text-signal pg-light:text-signal-deep", none: "text-fg-muted" } as const;

export function PointsTable({
  id,
  label,
  rows,
  headers,
}: {
  id: string;
  label: string;
  rows: PointsTableRow[];
  headers: { date: string; amount: string; reason: string; session: string; noSession: string };
}) {
  const quiet = (row: PointsTableRow) => (row.look === "plain" ? "" : "text-fg-muted");
  const columns: DataTableColumn<PointsTableRow>[] = [
    { key: "date", header: headers.date, cell: (row) => <span className={`whitespace-nowrap text-fg-muted ${row.look === "struck" ? "opacity-70" : ""}`}>{row.date}</span> },
    {
      key: "amount",
      header: headers.amount,
      cell: (row) =>
        row.figure ? (
          <span className={`font-display text-play-sm font-extrabold ${TONE[row.tone]} ${row.look === "struck" ? "opacity-70" : ""}`}>
            <span className="sr-only">{row.figureLabel}</span>
            <bdi dir="ltr" aria-hidden="true">
              {row.figure}
            </bdi>
          </span>
        ) : null,
    },
    {
      key: "reason",
      header: headers.reason,
      cell: (row) => (
        <span className={`${quiet(row)} ${row.look === "struck" ? "line-through opacity-70" : ""} ${row.tone === "loss" ? TONE.loss : ""}`}>
          <bdi>{row.reason}</bdi>
        </span>
      ),
    },
    {
      key: "session",
      header: headers.session,
      cell: (row) =>
        row.session ? (
          <Link href={row.session.href} className={`underline-offset-4 hover:underline ${quiet(row)} ${row.look === "struck" ? "opacity-70" : ""}`}>
            <bdi>{row.session.title}</bdi>
          </Link>
        ) : (
          <span className="text-fg-muted">{headers.noSession}</span>
        ),
    },
  ];
  return (
    <div id={id}>
      <DataTable label={label} columns={columns} rows={rows} rowKey={(row) => row.key} empty={{ title: label, action: { label, href: "/app/sessions" } }} />
    </div>
  );
}
