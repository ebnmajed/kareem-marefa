"use client";

import { useTranslations } from "next-intl";
import { ListRowMenu } from "@/components/admin/list-row-menu";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableSwatchCell } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import type { AdminCompany } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { setCompanyActiveAction } from "./actions";
import { teamColourNameOf } from "./team-colours";

// SCR-048's table, written for wave 22 from `AdminCompanies.dc.html` (`DEC-208`: deleted first): الشركة · الأعضاء ·
// النشطون · الربع · ⋯. ★ The company's colour is a swatch AND its name in words (`REQ-UIX-095`, `DEC-232`'s D6 ruling);
// none says «بلا لون». The quarter's points are READ — the quarter's company snapshot — and «—» before one exists.
// ★ No domain column and no logo (`DEC-231` §6.1, `DEC-195` §4): the artboard draws both; nothing stores either.

export interface CompanyRow extends AdminCompany {
  /** The quarter's company points, read from its snapshot; null before one exists or for a company not in it. */
  quarterPoints: number | null;
}

export function CompaniesTable({ companies, locale }: { companies: CompanyRow[]; locale: Locale }) {
  const t = useTranslations("admin.companies");
  const num = (n: number) => <bdi>{formatNumber(n)}</bdi>;

  const columns: DataTableColumn<CompanyRow>[] = [
    {
      key: "name",
      header: t("columnCompany"),
      onCard: true,
      cell: (c) => {
        const colour = teamColourNameOf(c.teamColor);
        return (
          <span className="inline-flex flex-wrap items-center gap-2">
            <DataTableSwatchCell color={c.teamColor} colorName={colour ? t(`teamColourNames.${colour}`) : t("teamColourNone")}>
              <bdi>{c.name}</bdi>
            </DataTableSwatchCell>
            {c.deactivatedAt !== null ? (
              <Badge tone="neutral" outline size="sm">
                {t("deactivated")}
              </Badge>
            ) : null}
          </span>
        );
      },
    },
    { key: "members", header: t("memberCountColumn"), onCard: true, cell: (c) => num(c.memberCount) },
    { key: "active", header: t("columnActive"), onCard: true, cell: (c) => num(c.activeMemberCount) },
    {
      key: "quarter",
      header: t("columnQuarter"),
      onCard: true,
      cell: (c) => (c.quarterPoints !== null ? num(c.quarterPoints) : <span className="text-fg-muted">{t("noValue")}</span>),
    },
    {
      key: "actions",
      header: t("columnActions"),
      align: "end",
      onCard: true,
      cell: (c) => (
        <ListRowMenu
          editHref={`/app/admin/companies?edit=${c.id}#company-editor`}
          active={c.deactivatedAt === null}
          onSetActive={(active) => setCompanyActiveAction(locale, c.id, active)}
          labels={{
            trigger: t.markup("moreActions", { name: c.name, t: (chunks) => chunks }),
            edit: t("edit"),
            deactivate: t("deactivate"),
            reactivate: t("activate"),
            confirmTitle: t.rich("deactivateConfirmTitle", { name: c.name, t: (chunks) => <bdi>{chunks}</bdi> }),
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
    <>
      <DataTable
        stickyHeader
        hiddenHeaders={["actions"]}
        label={t("title")}
        columns={columns}
        rows={companies}
        rowKey={(c) => c.id}
        empty={{ title: t("empty"), action: { label: t("newCompany"), href: "/app/admin/companies?new=1#company-editor" } }}
      />
      {companies.length > 0 ? (
        <p className="mt-3 text-caption text-fg-muted">{t.rich("countLine", { count: companies.length, value: formatNumber(companies.length), bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
      ) : null}
    </>
  );
}
