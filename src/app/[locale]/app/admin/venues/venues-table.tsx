"use client";

import { useTranslations } from "next-intl";
import { ListRowMenu } from "@/components/admin/list-row-menu";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableSwatchCell } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import type { AdminVenue } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";
import { setVenueActiveAction } from "./actions";

// SCR-046's table, written for wave 22 from `AdminVenues.dc.html` (`DEC-208`: deleted first): المكان · الشركة ·
// العنوان · السعة · الجلسات · ⋯. State lives in the row — a «معطّل» badge beside a deactivated venue's name, nothing
// beside an active one — and the row's decisions in its ⋯ (`ListRowMenu`).
//
// ★ The company is a swatch AND its name (`REQ-UIX-092`); a venue owned by nobody says «لا شركة» and draws no swatch,
// so nothing implies it hosts for anyone (`REQ-UIX-093`). A deactivated owner is named as inactive: it earns no hosting
// points while it is (`DEC-232` §1.2).

export function VenuesTable({ venues, locale }: { venues: AdminVenue[]; locale: Locale }) {
  const t = useTranslations("admin.venues");
  const num = (n: number) => <bdi>{formatNumber(n)}</bdi>;

  const columns: DataTableColumn<AdminVenue>[] = [
    {
      key: "name",
      header: t("columnVenue"),
      onCard: true,
      cell: (v) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-label text-fg-heading">
            <bdi>{v.name}</bdi>
          </span>
          {v.deactivatedAt !== null ? (
            <Badge tone="neutral" outline size="sm">
              {t("deactivated")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "company",
      header: t("columnCompany"),
      onCard: true,
      cell: (v) =>
        v.company ? (
          <DataTableSwatchCell color={v.company.teamColor} colorName={v.company.deactivated ? t("companyInactive") : ""}>
            <bdi>{v.company.name}</bdi>
          </DataTableSwatchCell>
        ) : (
          <span className="text-fg-muted">{t("noCompany")}</span>
        ),
    },
    {
      key: "address",
      header: t("columnAddress"),
      onCard: true,
      cell: (v) => (v.address ? <bdi>{v.address}</bdi> : <span className="text-fg-muted">{t("noValue")}</span>),
    },
    { key: "capacity", header: t("columnCapacity"), onCard: true, cell: (v) => (v.capacity !== null ? num(v.capacity) : <span className="text-fg-muted">{t("noValue")}</span>) },
    { key: "sessions", header: t("columnSessions"), onCard: true, cell: (v) => num(v.sessionCount) },
    {
      key: "actions",
      header: t("columnActions"),
      align: "end",
      onCard: true,
      cell: (v) => (
        <ListRowMenu
          editHref={`/app/admin/venues?edit=${v.id}#venue-editor`}
          active={v.deactivatedAt === null}
          onSetActive={(active) => setVenueActiveAction(locale, v.id, active)}
          labels={{
            trigger: t.markup("moreActions", { name: v.name, t: (chunks) => chunks }),
            edit: t("edit"),
            deactivate: t("deactivate"),
            reactivate: t("activate"),
            confirmTitle: t.rich("deactivateConfirmTitle", { name: v.name, t: (chunks) => <bdi>{chunks}</bdi> }),
            confirmBody: t("deactivateConfirmBody"),
            confirmAction: t("deactivateConfirmAction"),
            cancel: t("cancelDialogCancel"),
            close: t("closeDialog"),
            deactivated: t("deactivateDone"),
            reactivated: t("reactivateDone"),
            notWritten: t("notWritten"),
          }}
        />
      ),
    },
  ];

  return (
    <DataTable
      stickyHeader
      hiddenHeaders={["actions"]}
      label={t("title")}
      columns={columns}
      rows={venues}
      rowKey={(v) => v.id}
      empty={{ title: t("empty"), action: { label: t("newVenue"), href: "/app/admin/venues?new=1#venue-editor" } }}
    />
  );
}
