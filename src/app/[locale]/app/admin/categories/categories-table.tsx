"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { DeactivateToggle } from "@/components/admin/deactivate-toggle";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import type { AdminCategory } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { toggleCategory } from "./actions";

// SCR-047 · onto `ui/data-table` for wave 7 — see `venues-table.tsx`'s
// header for the shared reasoning ("one list pattern three times").

export function CategoriesTable({ categories, locale }: { categories: AdminCategory[]; locale: Locale }) {
  const t = useTranslations("admin.categories");
  const num = (n: number) => formatNumber(n);

  const columns: DataTableColumn<AdminCategory>[] = [
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
      key: "sessionCount",
      header: t("sessionCountColumn"),
      onCard: true,
      cell: (c) => <bdi>{t("sessionCount", { count: c.sessionCount, value: num(c.sessionCount) })}</bdi>,
    },
    {
      key: "status",
      header: t("statusColumn"),
      onCard: true,
      // ★ Always a Badge, never `null` for the active case — same sync-6
      // finding and fix as venues-table.tsx's own status cell.
      cell: (c) => (
        <Badge tone={c.deactivatedAt === null ? "success" : "neutral"} outline={c.deactivatedAt !== null}>
          {t(c.deactivatedAt === null ? "active" : "deactivated")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("actionsColumn"),
      // ★ `onCard` — without it the phone card list drops this column, and
      // an admin at 390 px cannot deactivate anything (wave 8, F1; the same
      // defect `sessions-table.tsx` fixed in wave 6).
      onCard: true,
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
          onActivate={() => toggleCategory(locale, c.id, true)}
          onDeactivate={() => toggleCategory(locale, c.id, false)}
        />
      ),
    },
  ];

  return (
    <DataTable
      label={t("listTitle")}
      columns={columns}
      rows={categories}
      rowKey={(c) => c.id}
      // ★ Not `t("addTitle")` — sync-3's own finding: the add form sits
      // directly above this table, so an empty-state action reading "أضف
      // تصنيفًا" duplicated the form's own submit button on one screen.
      empty={{ title: t("empty"), action: { label: t("emptyAction"), onClick: () => document.getElementById("c-name")?.focus() } }}
    />
  );
}
