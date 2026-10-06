"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { excerpt } from "@/components/announcements/rules";
import { formatDateTime } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { DataTableColumn, Tone } from "@/components/ui";
import type { AdminAnnouncement } from "@/lib/dal/announcements";
import type { Locale } from "@/i18n/routing";
import { deleteAnnouncementAction } from "./actions";

// The announcements table — REQ-ADM-025: الإعلان · النشر · ينتهي · ⋯. State lives in the row — مجدول · منشور · منتهٍ,
// and «أُرسل» once members were notified. The row's decisions are in its ⋯: «عدّل» is a LINK to `?edit=<id>`; «احذف»
// confirms first, naming the announcement and the consequence (`REQ-UIX-013`), and the toast says what was WRITTEN.

const PATH = "/app/admin/announcements";
const STATUS_TONE: Record<AdminAnnouncement["status"], Tone> = { scheduled: "info", live: "success", ended: "ended" };

function RowMenu({ row, locale }: { row: AdminAnnouncement; locale: Locale }) {
  const t = useTranslations("announcements");
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const name = excerpt(row.body);

  async function remove() {
    setPending(true);
    try {
      const { ok } = await deleteAnnouncementAction(locale, row.id);
      toast.show(ok ? { title: t("deleted"), tone: "success" } : { title: t("notWritten"), tone: "error" });
      if (ok) setConfirming(false);
    } catch {
      toast.show({ title: t("notWritten"), tone: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Menu
        align="end"
        trigger={
          <IconButton label={t.markup("moreActions", { excerpt: name, t: (c) => c })} size="sm">
            <MoreIcon />
          </IconButton>
        }
        items={[
          { label: t("edit"), href: `${PATH}?edit=${row.id}#announcement-editor` },
          { label: t("delete"), tone: "error", onSelect: () => setConfirming(true), startsGroup: true, disabled: pending },
        ]}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t.rich("deleteTitle", { excerpt: name, t: (c) => <bdi>{c}</bdi> })}
        body={<p>{row.status === "scheduled" && !row.announced ? t("deleteBodyScheduled") : t("deleteBody")}</p>}
        confirmLabel={t("deleteAction")}
        cancelLabel={t("cancel")}
        closeLabel={t("close")}
        pending={pending}
        onConfirm={() => void remove()}
      />
    </>
  );
}

export function AnnouncementsTable({ rows, timeZone, locale }: { rows: AdminAnnouncement[]; timeZone: string; locale: Locale }) {
  const t = useTranslations("announcements");

  const columns: DataTableColumn<AdminAnnouncement>[] = [
    {
      key: "body",
      header: t("columnBody"),
      onCard: true,
      cell: (row) => (
        <p className="max-w-prose whitespace-pre-line text-body-sm text-fg-heading">
          <bdi>{row.body}</bdi>
        </p>
      ),
    },
    {
      key: "publish",
      header: t("columnPublish"),
      onCard: true,
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <bdi className="text-body-sm">{formatDateTime(row.publishedAt, timeZone, locale)}</bdi>
          <Badge tone={STATUS_TONE[row.status]} size="sm" outline={row.status === "scheduled"}>
            {t(`status.${row.status}`)}
          </Badge>
          {row.announced ? (
            <Badge tone="neutral" size="sm" outline>
              {t("announced")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "expires",
      header: t("columnExpires"),
      onCard: true,
      cell: (row) => <bdi className="text-body-sm">{row.expiresAt ? formatDateTime(row.expiresAt, timeZone, locale) : t("noExpiry")}</bdi>,
    },
    {
      key: "actions",
      header: t("columnActions"),
      align: "end",
      onCard: true,
      cell: (row) => <RowMenu row={row} locale={locale} />,
    },
  ];

  return (
    <DataTable
      className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1"
      stickyHeader
      hiddenHeaders={["actions"]}
      label={t("title")}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      empty={{ title: t("empty"), action: { label: t("new"), href: `${PATH}?new=1#announcement-editor` } }}
    />
  );
}
