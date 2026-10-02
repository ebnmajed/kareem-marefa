"use client";

import { useTranslations } from "next-intl";
import { formatDateTime } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn, EmptyStateProps } from "@/components/ui";
import { Link } from "@/components/ui/link";

// SCR-062's table, written for wave 22 from `AdminAudit.dc.html` (`DEC-208`: deleted first): الوقت · الفاعل · الفعل ·
// الهدف. ★ Both stores, marked by kind (`REQ-UIX-099`, `DEC-231` §4.3): a configuration change carries «إعداد» beside
// its words, and its old and new value as the artboard draws a change — «القديم ← الجديد». A log row's reason follows
// its action, as the artboard's «· «وصل متأخرًا»» does. Read-only: an audit row is evidence, so there is no ⋯ and no
// selection, and nothing here edits one (`REQ-NFR-006`).
//
// Every word arrives resolved from the page (`audit-text.ts`); this file only lays them out.

export interface AuditTableRow {
  id: string;
  kind: "log" | "config";
  occurredAt: string;
  actorName: string | null;
  actorRole: string | null;
  isSystem: boolean;
  action: string;
  /** A history row's old → new; a log row's reason. */
  detail: { from: string; to: string } | null;
  reason: string | null;
  target: string | null;
  /** Everything that happened to this subject — set when the row names one. */
  targetHref: string | null;
}

const ROLE_KEYS = new Set(["admin", "moderator", "member", "platform_admin", "system"]);

export function AuditTable({ rows, timeZone, locale, empty }: { rows: AuditTableRow[]; timeZone: string; locale: string; empty: EmptyStateProps }) {
  const t = useTranslations("admin.audit");

  const columns: DataTableColumn<AuditTableRow>[] = [
    { key: "when", header: t("colDate"), onCard: true, cell: (r) => <bdi>{formatDateTime(r.occurredAt, timeZone, locale)}</bdi> },
    {
      key: "actor",
      header: t("colActor"),
      onCard: true,
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <bdi className="text-fg-heading">{r.isSystem ? t("systemActor") : (r.actorName ?? t("unknownActor"))}</bdi>
          {r.actorRole && ROLE_KEYS.has(r.actorRole) && !r.isSystem ? (
            <Badge size="sm" outline>
              {t(`roles.${r.actorRole}`)}
            </Badge>
          ) : null}
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
      cell: (r) =>
        r.target ? (
          <span className="inline-flex flex-col gap-0.5">
            <bdi>{r.target}</bdi>
            {r.targetHref ? (
              <Link href={r.targetHref} className="text-caption text-fg-heading underline underline-offset-4">
                {t("followSubject")}
              </Link>
            ) : null}
          </span>
        ) : (
          <span className="text-fg-muted">{t("noSubject")}</span>
        ),
    },
  ];

  return <DataTable stickyHeader label={t("listLabel")} columns={columns} rows={rows} rowKey={(r) => `${r.kind}-${r.id}`} empty={empty} />;
}
