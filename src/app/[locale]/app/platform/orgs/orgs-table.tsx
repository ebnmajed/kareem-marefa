"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import type { OrgSummary } from "@/lib/dal/platform";
import { OrgActions } from "./org-actions";

// SCR-080's list on `ui/data-table` — a real table from `md`, a stacked card list
// below it (`16` §6.7), never a sideways scroller on a phone.
//
// ★ Every figure is a COUNT (REQ-ADM-003). The org's name links to SCR-082, the
// one screen with anything more about it — its domains and its first admin.
// Seeing its data is SCR-085's act, and it lands in the org's own log.

/** The platform's own zone: a super admin has no org to take one from. */
const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export function OrgsTable({ orgs, locale }: { orgs: OrgSummary[]; locale: Locale }) {
  const t = useTranslations("platform.orgs");
  const num = (n: number) => formatNumber(n);

  const columns: DataTableColumn<OrgSummary>[] = [
    {
      key: "org",
      header: t("orgColumn"),
      cell: (org) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-label text-fg-heading">
            <bdi>{org.name}</bdi>
          </span>
          {/* A slug is Latin in an Arabic cell: isolated, left to right in its own box. */}
          <span className="text-caption text-fg-muted" dir="ltr">
            <bdi>{org.slug}</bdi>
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: t("statusColumn"),
      onCard: true,
      cell: (org) =>
        org.status === "active" ? (
          <Badge tone="success">{t("statusActive")}</Badge>
        ) : (
          <Badge tone="neutral" outline>
            {t("statusSuspended")}
          </Badge>
        ),
    },
    { key: "members", header: t("members"), onCard: true, align: "end", cell: (org) => <bdi>{num(org.members)}</bdi> },
    { key: "activeMembers", header: t("activeMembers"), align: "end", cell: (org) => <bdi>{num(org.activeMembers)}</bdi> },
    { key: "sessions", header: t("sessions"), onCard: true, align: "end", cell: (org) => <bdi>{num(org.sessions)}</bdi> },
    { key: "certificates", header: t("certificates"), align: "end", cell: (org) => <bdi>{num(org.certificates)}</bdi> },
    { key: "created", header: t("created"), cell: (org) => <bdi>{formatDate(org.createdAt, PLATFORM_TIME_ZONE, locale)}</bdi> },
    { key: "actions", header: t("actionsColumn"), onCard: true, cell: (org) => <OrgActions org={org} locale={locale} /> },
  ];

  return (
    <DataTable
      label={t("title")}
      columns={columns}
      rows={orgs}
      rowKey={(org) => org.id}
      rowHref={(org) => `/app/platform/orgs/${org.id}/domains`}
      empty={{ title: t("empty"), action: { label: t("newLink"), href: "/app/platform/orgs/new" } }}
    />
  );
}
