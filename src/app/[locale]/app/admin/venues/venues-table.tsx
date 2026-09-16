"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { DeactivateToggle } from "@/components/admin/deactivate-toggle";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import type { AdminVenue } from "@/lib/dal/sessions";
import type { Locale } from "@/i18n/routing";
import { toggleVenue } from "./actions";

// SCR-046 · onto `ui/data-table` for wave 7 — "one list pattern three
// times," `DEC-137`'s own framing (`docs/plan/notes/console.md`'s "Wave 7
// plan" §2), the same treatment `admin/members/members-table.tsx` already
// proved in wave 6. `src` stays server-computed props (no bound Server
// Action prop trap here — `toggleVenue` takes plain scalar arguments, not a
// row-bound closure, so it is imported directly rather than threaded down
// from `page.tsx`, unlike `sessions-table.tsx`/`members-table.tsx`'s own
// per-row bound actions).

export function VenuesTable({ venues, locale }: { venues: AdminVenue[]; locale: Locale }) {
  const t = useTranslations("admin.venues");
  const num = (n: number) => formatNumber(n);

  const columns: DataTableColumn<AdminVenue>[] = [
    {
      key: "name",
      header: t("nameColumn"),
      onCard: true,
      cell: (v) => (
        <div className="min-w-0">
          <p className="text-label text-fg-heading">
            <bdi>{v.name}</bdi>
          </p>
          {v.address ? (
            <p className="mt-0.5 text-body-sm text-fg-muted">
              <bdi>{v.address}</bdi>
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "capacity",
      header: t("capacityColumn"),
      onCard: true,
      cell: (v) => <span>{v.capacity !== null ? <bdi>{t("seats", { count: v.capacity, value: num(v.capacity) })}</bdi> : t("noCapacity")}</span>,
    },
    {
      key: "upcoming",
      header: t("upcomingColumn"),
      onCard: true,
      cell: (v) => <bdi>{t("upcoming", { count: v.upcomingSessions, value: num(v.upcomingSessions) })}</bdi>,
    },
    {
      key: "status",
      header: t("statusColumn"),
      onCard: true,
      // ★ Always a Badge, never `null` for the active case (sync 6's own
      // finding): the phone card list always renders the `statusColumn`
      // label (`ui/data-table.tsx`'s card mode has no notion of "skip this
      // field"), so a `null` cell left an "الحالة" row with no value beside
      // it. Same tone/outline convention as `admin/members/members-table.tsx`'s
      // own status cell.
      cell: (v) => (
        <Badge tone={v.deactivatedAt === null ? "success" : "neutral"} outline={v.deactivatedAt !== null}>
          {t(v.deactivatedAt === null ? "active" : "deactivated")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("actionsColumn"),
      cell: (v) => (
        <DeactivateToggle
          active={v.deactivatedAt === null}
          activateLabel={t("activate")}
          deactivateLabel={t("deactivate")}
          confirmTitle={t.rich("deactivateConfirmTitle", { name: v.name, t: (chunks) => <bdi>{chunks}</bdi> })}
          confirmBody={t("deactivateConfirmBody")}
          confirmAction={t("deactivateConfirmAction")}
          cancelLabel={t("cancelDialogCancel")}
          closeLabel={t("closeDialog")}
          deactivateDoneLabel={t("deactivateDone")}
          reactivateDoneLabel={t("reactivateDone")}
          onActivate={() => toggleVenue(locale, v.id, true)}
          onDeactivate={() => toggleVenue(locale, v.id, false)}
        />
      ),
    },
  ];

  return (
    <DataTable
      label={t("listTitle")}
      columns={columns}
      rows={venues}
      rowKey={(v) => v.id}
      // ★ Not `t("addTitle")` — a real sync-3 finding: the add form sits
      // directly above this table, so an empty-state action reading "أضف
      // مكانًا" duplicated the form's own submit button on one screen. The
      // action still moves focus to the form's first field; it just no
      // longer claims to be a second, independent way to add one.
      empty={{ title: t("empty"), action: { label: t("emptyAction"), onClick: () => document.getElementById("v-name")?.focus() } }}
    />
  );
}
