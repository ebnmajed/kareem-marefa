"use client";

import { useTranslations } from "next-intl";
import { deliveryReason } from "@/components/admin/delivery-reason";
import { formatDateTime } from "@/components/sessions/numerals";
import type { DataTableColumn, EmptyStateProps, Tone } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DeliveryDTO } from "@/lib/dal/notifications";

// SCR-058's delivery log — REQ-NTF-008: «a bounce or failure is visible to the
// org admin, WITH THE REASON». The reason reads twice: the kind of failure in
// Arabic, which is what an admin acts on, and the provider's own words beneath,
// which is the evidence a support conversation quotes.

export interface DeliveryDisplayRow extends DeliveryDTO {
  name: string;
}

const TONE: Record<DeliveryDTO["status"], Tone> = { queued: "neutral", sent: "info", delivered: "success", bounced: "error", failed: "error" };

export function DeliveriesTable({ rows, timeZone, locale, empty }: { rows: DeliveryDisplayRow[]; timeZone: string; locale: string; empty: EmptyStateProps }) {
  const t = useTranslations("notifications.admin.emails.deliveries");
  const columns: DataTableColumn<DeliveryDisplayRow>[] = [
    {
      key: "message",
      header: t("colMessage"),
      onCard: true,
      cell: (r) => <p className="text-label text-fg-heading">{r.name}</p>,
    },
    { key: "recipient", header: t("colRecipient"), onCard: true, cell: (r) => <bdi>{r.member?.displayName ?? t("unknownRecipient")}</bdi> },
    {
      key: "status",
      header: t("colStatus"),
      onCard: true,
      cell: (r) => (
        <Badge size="sm" tone={TONE[r.status]} outline={r.status === "queued"}>
          {t(`state.${r.status}`)}
        </Badge>
      ),
    },
    {
      key: "reason",
      header: t("colReason"),
      onCard: true,
      cell: (r) => {
        const reason = deliveryReason(r.error);
        if (!reason) return <span className="text-fg-muted">{t("noReason")}</span>;
        return (
          <span className="inline-flex min-w-0 flex-col gap-0.5">
            <span className="text-fg-heading">{t(`reasons.${reason}`)}</span>
            {/* The provider's own text reads from its own start — the left — not
                hanging off the card's end edge when it wraps. */}
            <bdi dir="ltr" className="block break-words text-start text-caption text-fg-muted">
              {r.error}
            </bdi>
          </span>
        );
      },
    },
    { key: "when", header: t("colWhen"), onCard: true, cell: (r) => <bdi>{formatDateTime(r.sentAt ?? r.createdAt, timeZone, locale)}</bdi> },
  ];
  return <DataTable label={t("listLabel")} columns={columns} rows={rows} rowKey={(r) => r.id} empty={empty} />;
}
