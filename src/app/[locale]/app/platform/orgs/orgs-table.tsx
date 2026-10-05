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

/**
 * «أغسطس 2026», as the board prints it — month and year, Western digits (`DEC-124`), the platform's zone — joined by
 * a no-break space so the cell stays one line. The full date rides in the cell's `title`.
 */
function monthYear(iso: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { month: "long", year: "numeric", timeZone: PLATFORM_TIME_ZONE }).formatToParts(new Date(iso));
  return parts.map((p) => (p.type === "literal" ? p.value.replace(/ /g, "\u00A0") : p.value)).join("");
}

export function OrgsTable({ orgs, locale }: { orgs: OrgSummary[]; locale: Locale }) {
  const t = useTranslations("platform.orgs");
  const num = (n: number) => <bdi>{formatNumber(n)}</bdi>;
  const statusBadge = (org: OrgSummary) =>
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
    );

  const columns: DataTableColumn<OrgSummary>[] = [
    {
      key: "org",
      header: t("orgColumn"),
      cell: (org) => (
        // One line, «name · slug», as drawn; it wraps — never truncates — where the column is narrow.
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 md:min-w-56">
          <span className="text-label text-fg-heading">
            <bdi>{org.name}</bdi>
          </span>
          <span aria-hidden className="text-caption text-fg-muted">
            ·
          </span>
          {/* A slug is Latin in an Arabic cell: isolated, left to right in its own box. */}
          <bdi dir="ltr" className="font-mono text-caption text-fg-muted">
            {org.slug}
          </bdi>
        </span>
      ),
    },
    {
      key: "status",
      header: t("statusColumn"),
      onCard: true,
      // A status is one badge on one line: «قيد الحذف» wrapped inside its badge at 1280.
      cell: (org) => <span className="whitespace-nowrap">{statusBadge(org)}</span>,
    },
    { key: "members", header: t("members"), onCard: true, align: "end", cell: (org) => num(org.members) },
    { key: "activeMembers", header: t("activeMembers"), align: "end", cell: (org) => num(org.activeMembers) },
    { key: "sessions", header: t("sessions"), onCard: true, align: "end", cell: (org) => num(org.sessions) },
    { key: "certificates", header: t("certificates"), align: "end", cell: (org) => num(org.certificates) },
    {
      key: "created",
      header: t("created"),
      cell: (org) => <bdi title={formatDate(org.createdAt, PLATFORM_TIME_ZONE, locale)}>{monthYear(org.createdAt, locale)}</bdi>,
    },
    { key: "actions", header: t("actionsColumn"), onCard: true, cell: (org) => <OrgActions org={org} locale={locale} /> },
  ];

  return (
    <DataTable
      // The surface card at md+, as every console table since wave 21 draws it; the rows are cards below `md`. No
      // `stickyHeader`: it makes the table `border-separate`, where a row's `border-b` is not drawn — and the board
      // draws a rule under every row. The first column takes the slack (`md:min-w-56` on its cell) so a long name
      // keeps to one or two lines while the counts stay narrow.
      className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1"
      hiddenHeaders={["actions"]}
      label={t("title")}
      columns={columns}
      rows={orgs}
      rowKey={(org) => org.id}
      rowHref={(org) => `/app/platform/orgs/${org.id}/domains`}
      empty={{ title: t("empty"), action: { label: t("newLink"), href: "/app/platform/orgs/new" } }}
    />
  );
}
