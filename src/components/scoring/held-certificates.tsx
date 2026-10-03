"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { releaseAchievements, type AchievementReleaseResult } from "@/components/certificates/actions";
import { formatNumber } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableActionPair } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";

// SCR-054's «شهادات الإنجاز بانتظار الإصدار» — REQ-CRT-012, REQ-UIX-101, written from `AdminRecognition.dc.html`
// (العضو · الإنجاز · منذ · «أصدر» / «أوقف»). Rendered through `designer`'s `HeldAchievements` slot, which stays
// presentation-only; the data and the writes are `designer`'s, called AS THEY ARE:
//  · «أصدر» — one row: `release_certificates()` through the page's action (`certificate.released`), after a confirmation
//    naming the member (`REQ-UIX-013`: issuing a certificate confirms). Many rows: `data-table`'s selection and its bulk
//    bar, `releaseAchievements` — kept from the page this replaced, the toast counting what was RELEASED.
//  · «أوقف» — `revoke_certificate()` with its mandatory reason (`REQ-CRT-011`, `certificate.revoked`): the row's
//    `?revoke=<id>` sheet, so it works without JS too. Nothing notifies the member: a held certificate was never theirs
//    to see.
// The achievement is named by its badge, or by its board's period in words — never a snapshot's ISO date.

export interface HeldCertificateView {
  id: string;
  memberId: string;
  /** The one resolver's same-origin href (`DEC-099`), or null for initials. */
  avatarUrl: string | null;
  recipientName: string;
  serial: string;
  badgeName: string | null;
  period: { kind: string; start: string | null; end: string | null } | null;
  createdAt: string;
}

const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
const DAY = 86_400_000;

function periodDate(date: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function HeldCertificates({
  rows,
  locale,
  now,
  release,
}: {
  rows: HeldCertificateView[];
  locale: string;
  /** The server's clock at render, so the age reads the same on the server and the hydrating client. */
  now: string;
  release: (certificateId: string) => Promise<{ ok: boolean }>;
}) {
  const t = useTranslations("recognition.admin");
  const toast = useToast();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmingMany, setConfirmingMany] = useState(false);
  const [confirmingOne, setConfirmingOne] = useState<HeldCertificateView | null>(null);
  const [pending, startTransition] = useTransition();

  const achievement = (r: HeldCertificateView) => {
    if (r.badgeName) return t.rich("held.badge", { name: r.badgeName, bdi });
    if (r.period?.kind === "monthly" && r.period.start) return t.rich("held.boardMonthly", { month: periodDate(r.period.start, locale, { month: "long", year: "numeric" }), bdi });
    if (r.period?.start && r.period.end) {
      return t.rich("held.boardRange", { start: periodDate(r.period.start, locale, { dateStyle: "medium" }), end: periodDate(r.period.end, locale, { dateStyle: "medium" }), bdi });
    }
    return t("held.board");
  };
  const age = (r: HeldCertificateView) => {
    const days = Math.floor((Date.parse(now) - Date.parse(r.createdAt)) / DAY);
    return days < 1 ? t("held.age.today") : t.rich("held.age.days", { count: days, value: formatNumber(days), bdi });
  };

  const columns: DataTableColumn<HeldCertificateView>[] = [
    {
      key: "member",
      header: t("held.colMember"),
      onCard: true,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <Avatar memberId={r.memberId} displayName={r.recipientName} src={r.avatarUrl} size={32} decorative />
          <span className="flex flex-col">
            <bdi className="text-label text-fg-heading">{r.recipientName}</bdi>
            <bdi dir="ltr" className="text-caption text-fg-muted">
              {r.serial}
            </bdi>
          </span>
        </span>
      ),
    },
    { key: "achievement", header: t("held.colAchievement"), onCard: true, cell: (r) => <span>{achievement(r)}</span> },
    { key: "since", header: t("held.colSince"), onCard: true, cell: age },
    {
      key: "decide",
      header: t("held.colDecide"),
      onCard: true,
      cell: (r) => (
        <DataTableActionPair
          rowName={r.recipientName}
          primary={{ label: t("held.issue"), onAction: () => setConfirmingOne(r) }}
          secondary={{ label: t("held.stop"), onAction: () => router.push(`/app/admin/recognition?revoke=${r.id}#revoke-editor`) }}
        />
      ),
    },
  ];

  function releaseOne(r: HeldCertificateView) {
    startTransition(async () => {
      const result = await release(r.id).catch(() => ({ ok: false }));
      setConfirmingOne(null);
      toast.show({ title: result.ok ? t("held.issued") : t("held.failed"), tone: result.ok ? "success" : "error" });
    });
  }

  function releaseMany() {
    const ids = selected;
    startTransition(async () => {
      const data = new FormData();
      for (const id of ids) data.append("id", id);
      let result: AchievementReleaseResult | null = null;
      try {
        result = await releaseAchievements(data);
      } catch {
        result = null;
      }
      setConfirmingMany(false);
      if (result?.status === "ok") {
        setSelected([]);
        toast.show({ title: t.markup("held.released", { count: result.count, value: formatNumber(result.count), bdi: (chunks) => chunks }), tone: "success" });
      } else {
        toast.show({ title: t(result?.status === "not_authorized" ? "held.notAuthorized" : "held.failed"), tone: "error" });
      }
    });
  }

  const count = selected.length;
  return (
    <>
      <DataTable
        className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1"
        label={t("held.listLabel")}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selection={{
          selected,
          onChange: setSelected,
          label: (n) => t.markup("held.selected", { count: n, value: formatNumber(n), bdi: (chunks) => chunks }),
          actions: (
            <Button type="button" size="sm" onClick={() => setConfirmingMany(true)}>
              {t("held.release")}
            </Button>
          ),
        }}
        empty={{ title: t("held.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }}
      />
      <ConfirmDialog
        open={confirmingOne !== null}
        onOpenChange={(open) => (open ? null : setConfirmingOne(null))}
        title={confirmingOne ? t.rich("held.issueTitle", { name: confirmingOne.recipientName, bdi }) : ""}
        body={<p>{t("held.confirmBody")}</p>}
        confirmLabel={t("held.issue")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        tone="primary"
        pending={pending}
        onConfirm={() => (confirmingOne ? releaseOne(confirmingOne) : undefined)}
      />
      <ConfirmDialog
        open={confirmingMany}
        onOpenChange={setConfirmingMany}
        title={t.rich("held.confirmTitle", { count, value: formatNumber(count), bdi })}
        body={<p>{t("held.confirmBody")}</p>}
        confirmLabel={t("held.confirm")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        tone="primary"
        pending={pending}
        onConfirm={releaseMany}
      />
    </>
  );
}
