"use client";

import { useTranslations } from "next-intl";
import { formatDateTime } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";

// SCR-058's template catalogue — every message `08` §1 sends by email, with
// the matrix beside it (the lead's sync-1 ruling Q4): its kind, the channels it
// uses, whether a member can switch it off or it always arrives, and whether
// the org has its own template. The screen used to be a wrap of chip links
// that said none of that.

export interface TemplateCatalogueRow {
  key: string;
  name: string;
  category: string;
  inApp: boolean;
  email: boolean;
  optional: boolean;
  overriddenAt: string | null;
}

const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

export function TemplatesTable({ rows, timeZone, locale }: { rows: TemplateCatalogueRow[]; timeZone: string; locale: string }) {
  const t = useTranslations("notifications.admin.emails.catalogue");
  const columns: DataTableColumn<TemplateCatalogueRow>[] = [
    {
      key: "message",
      header: t("colMessage"),
      onCard: true,
      // The message's name alone: `MSG-proposal_submitted` is the plan's
      // identifier, which an org admin has no use for (sync 2, as the audit
      // card's raw key). The row still links by it, through `?key=`.
      cell: (r) => <p className="text-label text-fg-heading">{r.name}</p>,
    },
    { key: "category", header: t("colCategory"), onCard: true, cell: (r) => <span>{r.category}</span> },
    {
      key: "channels",
      header: t("colChannels"),
      onCard: true,
      cell: (r) => (
        <span className="inline-flex flex-wrap gap-1.5">
          {r.email ? (
            <Badge size="sm" tone="info">
              {t("email")}
            </Badge>
          ) : null}
          {r.inApp ? (
            <Badge size="sm" tone="neutral" outline>
              {t("inApp")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    { key: "member", header: t("colMember"), onCard: true, cell: (r) => <span>{r.optional ? t("optional") : t("always")}</span> },
    {
      key: "template",
      header: t("colTemplate"),
      onCard: true,
      cell: (r) =>
        r.overriddenAt ? (
          <span className="inline-flex flex-col gap-0.5">
            <Badge size="sm" tone="success">
              {t("overridden")}
            </Badge>
            <span className="text-caption text-fg-muted">{t.rich("updatedAt", { when: formatDateTime(r.overriddenAt, timeZone, locale), bdi })}</span>
          </span>
        ) : (
          <Badge size="sm" tone="neutral" outline>
            {t("usingDefault")}
          </Badge>
        ),
    },
  ];
  return (
    <DataTable
      label={t("listLabel")}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.key}
      rowHref={(r) => `/app/admin/emails?key=${encodeURIComponent(r.key)}`}
      empty={{ title: t("empty"), action: { label: t("emptyAction"), href: "/app/admin/emails?view=log" } }}
    />
  );
}
