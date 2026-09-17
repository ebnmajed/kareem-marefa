"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { releaseAchievements, type AchievementReleaseResult } from "@/components/certificates/actions";
import { formatNumber } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";

// SCR-054's held achievement certificates — REQ-CRT-012: leaderboard and badge
// certificates are prepared HELD and «released by an admin». The release is
// `designer`'s action (`components/certificates/actions.ts`); this is its
// presentation, which `console` holds for wave 8.
//
// It was a column of checkboxes and a release button with no confirmation —
// and `REQ-UIX-013` names issuing certificates among the actions that must
// confirm — naming a leaderboard certificate by its period's raw ISO date. It
// is now `ui/data-table`'s selection with its bulk bar, a confirmation that
// counts the certificates and says what releasing does, and the period in
// words (`listHeldAchievements()`'s `badgeName`/`period`, R-D2).
//
// The release answers (`designer`'s R-D1, `246cfbf`): the toast counts what was
// released, not what was selected, and a refusal says so and keeps the
// selection — it used to close on nothing and say nothing.

export interface HeldAchievementRow {
  id: string;
  recipientName: string;
  serial: string;
  badgeName: string | null;
  period: { kind: string; start: string | null; end: string | null } | null;
}

const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

function periodDate(date: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function HeldAchievementsTable({ rows, locale }: { rows: HeldAchievementRow[]; locale: string }) {
  const t = useTranslations("recognition.admin");
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const achievement = (r: HeldAchievementRow) => {
    if (r.badgeName) return t.rich("held.badge", { name: r.badgeName, bdi });
    if (r.period?.kind === "monthly" && r.period.start) return t.rich("held.boardMonthly", { month: periodDate(r.period.start, locale, { month: "long", year: "numeric" }), bdi });
    if (r.period?.start && r.period.end) {
      return t.rich("held.boardRange", { start: periodDate(r.period.start, locale, { dateStyle: "medium" }), end: periodDate(r.period.end, locale, { dateStyle: "medium" }), bdi });
    }
    return t("held.board");
  };

  const columns: DataTableColumn<HeldAchievementRow>[] = [
    {
      key: "recipient",
      header: t("held.colRecipient"),
      onCard: true,
      cell: (r) => (
        <p className="text-label text-fg-heading">
          <bdi>{r.recipientName}</bdi>
        </p>
      ),
    },
    { key: "achievement", header: t("held.colAchievement"), onCard: true, cell: (r) => <span>{achievement(r)}</span> },
    {
      key: "serial",
      header: t("held.colSerial"),
      onCard: true,
      cell: (r) => (
        <bdi dir="ltr" className="text-body-sm">
          {r.serial}
        </bdi>
      ),
    },
  ];

  function release() {
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
      setConfirming(false);
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
        label={t("held.listLabel")}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selection={{
          selected,
          onChange: setSelected,
          label: (n) => t.markup("held.selected", { count: n, value: formatNumber(n), bdi: (chunks) => chunks }),
          actions: (
            <Button type="button" size="sm" onClick={() => setConfirming(true)}>
              {t("held.release")}
            </Button>
          ),
        }}
        empty={{ title: t("held.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t.rich("held.confirmTitle", { count, value: formatNumber(count), bdi })}
        body={<p>{t("held.confirmBody")}</p>}
        confirmLabel={t("held.confirm")}
        cancelLabel={t("common.cancel")}
        closeLabel={t("common.close")}
        tone="primary"
        pending={pending}
        onConfirm={release}
      />
    </>
  );
}
