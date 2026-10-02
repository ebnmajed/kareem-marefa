"use client";

import { useTranslations } from "next-intl";
import { ListRowMenu } from "@/components/admin/list-row-menu";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import type { AdminCategory } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { setCategoryActiveAction } from "./actions";

// SCR-047's table, written for wave 22 from `AdminCategories.dc.html` (`DEC-208`: deleted first): التصنيف · الجلسات
// · ⋯. State lives in the row; the row's decisions in its ⋯. ★ The menu offers no delete: `categories` has no delete
// grant and no delete policy (0004), so a category is retired by deactivating it (`REQ-ADM-007`, `DEC-231` D3).
// ★ A category a proposal alone carries is in use too, and the row says so (`DEC-232` §4.4).

export function CategoriesTable({ categories, locale }: { categories: AdminCategory[]; locale: Locale }) {
  const t = useTranslations("admin.categories");

  const columns: DataTableColumn<AdminCategory>[] = [
    {
      key: "name",
      header: t("columnCategory"),
      onCard: true,
      cell: (c) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-label text-fg-heading">
            <bdi>{c.name}</bdi>
          </span>
          {c.deactivatedAt !== null ? (
            <Badge tone="neutral" outline size="sm">
              {t("deactivated")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "sessions",
      header: t("sessionCountColumn"),
      onCard: true,
      cell: (c) => (
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
          <bdi>{formatNumber(c.sessionCount)}</bdi>
          {c.proposalCount > 0 ? (
            <span className="text-caption text-fg-muted">{t.rich("proposalCount", { count: c.proposalCount, value: formatNumber(c.proposalCount), bdi: (chunks) => <bdi>{chunks}</bdi> })}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("columnActions"),
      align: "end",
      onCard: true,
      cell: (c) => (
        <ListRowMenu
          editHref={`/app/admin/categories?edit=${c.id}#category-editor`}
          active={c.deactivatedAt === null}
          onSetActive={(active) => setCategoryActiveAction(locale, c.id, active)}
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
    <DataTable
      // The surface card at md+, as 042 and the boards draw every console table (the lead's wave-22 ruling); cards below.
      className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1"
      stickyHeader
      hiddenHeaders={["actions"]}
      label={t("title")}
      columns={columns}
      rows={categories}
      rowKey={(c) => c.id}
      empty={{ title: t("empty"), action: { label: t("newCategory"), href: "/app/admin/categories?new=1#category-editor" } }}
    />
  );
}
