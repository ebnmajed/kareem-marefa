"use client";

import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn, EmptyStateProps } from "@/components/ui";
import { Link } from "@/components/ui/link";

// SCR-062's table, written for wave 22 from `AdminAudit.dc.html` (`DEC-208`: deleted first): الوقت · الفاعل · الفعل ·
// الهدف. ★ Both stores, marked by kind (`REQ-UIX-099`, `DEC-231` §4.3): a configuration change carries «إعداد» beside
// its words, and its old and new value as the artboard draws a change — «القديم ← الجديد». A log row's reason follows
// its action, as the artboard's «· «وصل متأخرًا»» does. Read-only: an audit row is evidence, so there is no ⋯ and no
// selection, and nothing here edits one (`REQ-NFR-006`). The actor is a face and a name; the time a day said relative
// to today, the full instant in the `<time>`'s title; the target one line, itself the link to its history.
//
// Every word arrives resolved from the page (`audit-text.ts`); this file only lays them out.

export interface AuditTableRow {
  id: string;
  kind: "log" | "config";
  /** «اليوم 6:45 م» — the day said relative to today on the org's clock, computed on the server. */
  when: { label: string; iso: string; full: string };
  actorId: string | null;
  actorName: string | null;
  actorFace: { avatarUrl: string | null; teamColor: string | null | undefined } | null;
  isSystem: boolean;
  action: string;
  /** A history row's old → new; a log row's reason. */
  detail: { from: string; to: string } | null;
  reason: string | null;
  target: string | null;
  /** The target is itself the link to everything that happened to it — set when the row names one. */
  targetHref: string | null;
}

export function AuditTable({ rows, empty }: { rows: AuditTableRow[]; empty: EmptyStateProps }) {
  const t = useTranslations("admin.audit");

  const columns: DataTableColumn<AuditTableRow>[] = [
    {
      key: "when",
      header: t("colDate"),
      onCard: true,
      cell: (r) => (
        <time dateTime={r.when.iso} title={r.when.full}>
          <bdi>{r.when.label}</bdi>
        </time>
      ),
    },
    {
      key: "actor",
      header: t("colActor"),
      onCard: true,
      // ★ The face, as the board draws it — the role is not in the board's row (the lead's ruling).
      cell: (r) =>
        r.isSystem || !r.actorId ? (
          <span className="text-fg-heading">{t("systemActor")}</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Avatar memberId={r.actorId} displayName={r.actorName} src={r.actorFace?.avatarUrl ?? null} teamColor={r.actorFace?.teamColor} size={24} decorative />
            <bdi className="text-fg-heading">{r.actorName ?? t("unknownActor")}</bdi>
          </span>
        ),
    },
    {
      key: "action",
      header: t("colAction"),
      onCard: true,
      cell: (r) => (
        <span className="inline-flex flex-col gap-0.5">
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-label text-fg-heading">{r.action}</span>
            {r.kind === "config" ? (
              <Badge size="sm" tone="neutral">
                {t("kinds.config")}
              </Badge>
            ) : null}
          </span>
          {r.detail ? <span className="text-caption text-fg-muted">{t.rich("config.change", { from: r.detail.from, to: r.detail.to, bdi: (chunks) => <bdi>{chunks}</bdi> })}</span> : null}
          {r.reason ? (
            <span className="text-caption text-fg-muted">
              «<bdi>{r.reason}</bdi>»
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "target",
      header: t("colTarget"),
      onCard: true,
      // One line: the target, itself the link to its filtered history when it has one.
      cell: (r) =>
        r.target ? (
          r.targetHref ? (
            <Link href={r.targetHref} className="text-fg-body underline-offset-4 hover:underline">
              <bdi>{r.target}</bdi>
            </Link>
          ) : (
            <bdi>{r.target}</bdi>
          )
        ) : (
          <span className="text-fg-muted">{t("noSubject")}</span>
        ),
    },
  ];

  return <DataTable stickyHeader className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1" label={t("listLabel")} columns={columns} rows={rows} rowKey={(r) => `${r.kind}-${r.id}`} empty={empty} />;
}
