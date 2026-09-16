"use client";

import { useTranslations } from "next-intl";
import type { EligibleRecipient } from "@/lib/dal/certificates";
import type { DataTableColumn } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { AlertCircleIcon } from "@/components/ui/icons";

// SCR-045's «من يستحق» — REQ-CRT-001, DEC-141, DEC-148.
//
// Exactly the two groups `fan_out_certificates()` reads, and nothing else:
// active check-ins for attendance, accepted presenters for presenting. There
// is no exclusion control and no «attended and rated» rule (DEC-148): a list
// the admin can edit before issuance would be a second definition of who
// attended, and the attendance record is the one.
//
// ★ THE REVOKED-AND-RE-ADDED MEMBER IS NAMED, not hidden (my note, W8.g). A
// check-in removed after issuance revokes the certificate (REQ-CHK-017); if
// the check-in is then restored, the fan-out has already run and issues
// nothing new. The row says so, so staff see the gap rather than learn of it
// from the member.

export function EligibleList({ rows, sessionId }: { rows: EligibleRecipient[]; sessionId: string }) {
  const t = useTranslations("certificates.session");
  const tk = useTranslations("certificates.kind");

  const columns: DataTableColumn<EligibleRecipient>[] = [
    {
      key: "name",
      header: t("columns.name"),
      // The note rides under the name rather than in a column of its own: on
      // the phone a column is a labelled line on EVERY card, and «ملاحظة»
      // with nothing beside it on forty cards buried the one that mattered.
      cell: (r) => (
        <span className="flex flex-col gap-1">
          <bdi className="text-fg-heading">{r.name}</bdi>
          {r.revokedButPresent ? (
            // A sentence, not a badge: a fixed-height chip clips a line this
            // long at 390 px, and colour is never the only channel (the glyph is).
            <span className="flex items-start gap-1.5 text-body-sm font-normal text-error">
              <AlertCircleIcon className="mt-1 shrink-0" aria-hidden="true" />
              {t("revokedButPresent")}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "kind",
      header: t("columns.kind"),
      cell: (r) => tk(r.kind),
      onCard: true,
    },
  ];

  return (
    <DataTable
      label={t("eligibleLabel")}
      rows={rows}
      rowKey={(r) => `${r.kind}:${r.memberId}`}
      columns={columns}
      empty={{
        title: t("eligibleEmptyTitle"),
        description: t("eligibleEmptyDescription"),
        action: {
          label: t("attendanceLink"),
          href: `/app/admin/sessions/${sessionId}/attendance`,
        },
      }}
    />
  );
}
