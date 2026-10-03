"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon } from "@/components/ui/icons";
import { DataTable } from "@/components/ui/data-table";

// SCR-060 in read mode — the artboard's one table (`AdminReminders.dc.html:57-63`). `data-table` is a client
// component, so the rows arrive as plain values and pre-rendered nodes (no closure crosses the RSC boundary, `DEC-159`).
//
// ★ «مفعّل» is TEXT with a glyph, never a control (`DEC-232` §3.4, R-D8): a switch in read mode would look like it
// writes, and nothing writes before «عدّل» → «احفظ». An «off» row says «متوقف» in words, not by an absent glyph alone.

export interface ReadRow {
  id: string;
  reminder: string;
  timing: ReactNode;
  channels: string;
  on: boolean;
  enabled: string;
}

export function RemindersTable({ rows }: { rows: ReadRow[] }) {
  const t = useTranslations("notifications.admin.reminders");
  return (
    <DataTable<ReadRow>
      className="mt-6 md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1"
      label={t("title")}
      rows={rows}
      rowKey={(row) => row.id}
      empty={{ title: t("title"), action: { label: t("edit"), href: "/app/admin/reminders?edit" } }}
      columns={[
        { key: "reminder", header: t("columns.reminder"), cell: (row) => row.reminder, onCard: true },
        { key: "timing", header: t("columns.timing"), cell: (row) => row.timing, onCard: true },
        { key: "channels", header: t("columns.channels"), cell: (row) => row.channels, onCard: true },
        {
          key: "enabled",
          header: t("columns.enabled"),
          onCard: true,
          cell: (row) => (
            <span className={`inline-flex items-center gap-1 ${row.on ? "text-fg-body" : "text-fg-muted"}`}>
              {row.on ? <CheckIcon aria-hidden="true" /> : null}
              {row.enabled}
            </span>
          ),
        },
      ]}
    />
  );
}
