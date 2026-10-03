"use client";

import { useTranslations } from "next-intl";
import type { EligibleRecipient } from "@/lib/dal/certificates";
import type { DataTableColumn } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { AlertCircleIcon } from "@/components/ui/icons";

// SCR-045's «من يستحق» (REQ-CRT-001, REQ-DSG-031 step 2): exactly who `fan_out_certificates()` reads — complete
// attendees and accepted presenters, one row per member and kind; no exclusion control, because a list the admin could
// edit would be a second definition of who attended (DEC-148). Before completion it is the live list beside the mode.
// After it, `without` shows only the eligible members holding no live certificate, and says in one word whether the gap
// closes itself (a check-in removed and restored is replaced) or never does (revoked for cause) — DEC-160 §6.

export function EligibleTable({ rows, sessionId, label, without = false }: { rows: EligibleRecipient[]; sessionId: string; label: string; without?: boolean }) {
  const t = useTranslations("certificates.session");
  const tk = useTranslations("certificates.kind");
  const columns: DataTableColumn<EligibleRecipient>[] = [
    {
      key: "name",
      header: t("columns.name"),
      cell: (r) => (
        <span className="flex flex-col gap-1">
          <bdi className="text-fg-heading">{r.name}</bdi>
          {r.revokedButPresent ? (
            r.revocationIsFinal ? (
              <span className="flex items-center gap-1.5 text-body-sm font-normal text-error">
                <AlertCircleIcon className="shrink-0" aria-hidden="true" />
                {t("final")}
              </span>
            ) : (
              <span className="text-body-sm font-normal text-fg-muted">{t("replaceable")}</span>
            )
          ) : null}
        </span>
      ),
    },
    { key: "kind", header: t("columns.kind"), cell: (r) => tk(r.kind), onCard: true },
  ];
  return (
    <DataTable
      label={label}
      rows={without ? rows.filter((r) => r.revokedButPresent) : rows}
      rowKey={(r) => `${r.kind}:${r.memberId}`}
      columns={columns}
      empty={{
        title: t("eligibleEmptyTitle"),
        description: t("eligibleEmptyDescription"),
        action: { label: t("attendanceLink"), href: `/app/admin/sessions/${sessionId}/attendance` },
      }}
    />
  );
}
