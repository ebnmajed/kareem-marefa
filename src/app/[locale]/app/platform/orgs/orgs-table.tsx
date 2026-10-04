"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import type { OrgSummary } from "@/lib/dal/platform";
import { OrgActions } from "./org-actions";

// SCR-080's table, as `PlatformOrgs.dc.html` draws it: org · slug, status, members, active, sessions, certificates,
// created, and the row's acts. On `ui/data-table` — a stacked card list under `md`, never a sideways scroller.
//
// ★ Every figure is a COUNT (REQ-ADM-003), and a pending deletion keeps its real counts (DEC-251, Q9): the board's
// «—» would hide a number the console holds. «النشطون» is members whose status is active, as the view counts it.
// The org's name links to SCR-082, the one screen with anything more about it.

/** The platform's own zone: a super admin has no org to take one from. */
const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export function OrgsTable({ orgs, locale }: { orgs: OrgSummary[]; locale: Locale }) {
  const t = useTranslations("platform.orgs");
  const num = (n: number) => <bdi>{formatNumber(n)}</bdi>;

  const columns: DataTableColumn<OrgSummary>[] = [
    {
      key: "org",
      header: t("orgColumn"),
      cell: (org) => (
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-label text-fg-heading">
            <bdi>{org.name}</bdi>
          </span>
          {/* A slug is Latin in an Arabic cell: isolated, left to right in its own box. */}
          <span className="font-mono text-caption text-fg-muted" dir="ltr">
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
        org.deletionPending ? (
          <Badge tone="error" outline>
            {t("statusDeleting")}
          </Badge>
        ) : org.status === "active" ? (
          <Badge tone="success">{t("statusActive")}</Badge>
        ) : (
          <Badge tone="neutral" outline>
            {t("statusSuspended")}
          </Badge>
        ),
    },
    { key: "members", header: t("members"), onCard: true, align: "end", cell: (org) => num(org.members) },
    { key: "activeMembers", header: t("activeMembers"), align: "end", cell: (org) => num(org.activeMembers) },
    { key: "sessions", header: t("sessions"), onCard: true, align: "end", cell: (org) => num(org.sessions) },
    { key: "certificates", header: t("certificates"), align: "end", cell: (org) => num(org.certificates) },
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
