"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { DeactivateToggle } from "@/components/admin/deactivate-toggle";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import type { AdminCompany } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { toggleCompany } from "./actions";

// SCR-048 · onto `ui/data-table` for wave 7 — see `venues-table.tsx`'s
// header for the shared reasoning ("one list pattern three times").

export function CompaniesTable({ companies, locale }: { companies: AdminCompany[]; locale: Locale }) {
  const t = useTranslations("admin.companies");
  const num = (n: number) => formatNumber(n);

  const columns: DataTableColumn<AdminCompany>[] = [
    {
      key: "name",
      header: t("nameColumn"),
      onCard: true,
      cell: (c) => (
        <span className="text-label text-fg-heading">
          <bdi>{c.name}</bdi>
        </span>
      ),
    },
    {
      key: "memberCount",
      header: t("memberCountColumn"),
      onCard: true,
      cell: (c) => <bdi>{t("memberCount", { count: c.memberCount, value: num(c.memberCount) })}</bdi>,
    },
    {
      key: "status",
      header: t("statusColumn"),
      onCard: true,
      cell: (c) =>
        c.deactivatedAt === null ? null : (
          <Badge tone="neutral" outline>
            {t("deactivated")}
          </Badge>
        ),
    },
    {
      key: "actions",
      header: t("actionsColumn"),
      cell: (c) => (
        <DeactivateToggle
          active={c.deactivatedAt === null}
          activateLabel={t("activate")}
          deactivateLabel={t("deactivate")}
          confirmTitle={t.rich("deactivateConfirmTitle", { name: c.name, t: (chunks) => <bdi>{chunks}</bdi> })}
          confirmBody={t("deactivateConfirmBody")}
          confirmAction={t("deactivateConfirmAction")}
          cancelLabel={t("cancelDialogCancel")}
          closeLabel={t("closeDialog")}
          deactivateDoneLabel={t("deactivateDone")}
          reactivateDoneLabel={t("reactivateDone")}
          onActivate={() => toggleCompany(locale, c.id, true)}
          onDeactivate={() => toggleCompany(locale, c.id, false)}
        />
      ),
    },
  ];

  return (
    <DataTable
      label={t("listTitle")}
      columns={columns}
      rows={companies}
      rowKey={(c) => c.id}
      empty={{ title: t("empty"), action: { label: t("addTitle"), onClick: () => document.getElementById("co-name")?.focus() } }}
    />
  );
}
