"use client";

import { useTranslations } from "next-intl";
import { formatDateTime } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn, EmptyStateProps } from "@/components/ui";
import { Link } from "@/components/ui/link";

// SCR-062's log on `ui/data-table` — the stacked card list below `md`, never
// the 640 px table this screen used to scroll sideways on a phone (`16` §6.7).
// A read-only list: an audit row is evidence, and nothing on this screen edits
// one, so there is no actions column and no selection.
//
// The action leads each row and each card, in Arabic, and only in Arabic. The
// raw key (`member.role_changed`) was a caption beneath it until sync 2 and is
// gone: every label maps back to exactly one key through `admin.audit.actions`
// (`admin-audit-labels.test.ts` fails on a key without one), a key with no
// label is shown raw as the label itself, and nobody who reads this screen
// needs the machine's word for what happened.

export interface AuditTableRow {
  id: string;
  actionLabel: string;
  actorName: string | null;
  actorRole: string | null;
  isSystem: boolean;
  subjectLabel: string | null;
  /** Everything that happened to this subject — set when the row names one. */
  subjectHref: string | null;
  reason: string | null;
  occurredAt: string;
}

const ROLE_KEYS = new Set(["admin", "moderator", "member", "platform_admin", "system"]);

export function AuditTable({ rows, timeZone, locale, empty }: { rows: AuditTableRow[]; timeZone: string; locale: string; empty: EmptyStateProps }) {
  const t = useTranslations("admin.audit");

  const columns: DataTableColumn<AuditTableRow>[] = [
    {
      key: "action",
      header: t("colAction"),
      onCard: true,
      cell: (r) => <p className="text-label text-fg-heading">{r.actionLabel}</p>,
    },
    {
      key: "when",
      header: t("colDate"),
      onCard: true,
      cell: (r) => <bdi>{formatDateTime(r.occurredAt, timeZone, locale)}</bdi>,
    },
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
      key: "subject",
      header: t("colSubject"),
      onCard: true,
      cell: (r) =>
        r.subjectLabel ? (
          <span className="inline-flex flex-col gap-0.5">
            <span>{r.subjectLabel}</span>
            {r.subjectHref ? (
              <Link href={r.subjectHref} className="text-caption text-fg-heading underline underline-offset-4">
                {t("followSubject")}
              </Link>
            ) : null}
          </span>
        ) : (
          <span className="text-fg-muted">{t("noSubject")}</span>
        ),
    },
    {
      key: "reason",
      header: t("colReason"),
      onCard: true,
      cell: (r) => (r.reason ? <bdi>{r.reason}</bdi> : <span className="text-fg-muted">{t("noReason")}</span>),
    },
  ];

  return <DataTable label={t("listLabel")} columns={columns} rows={rows} rowKey={(r) => r.id} empty={empty} />;
}
