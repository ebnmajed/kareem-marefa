"use client";

import { useTranslations } from "next-intl";
import { RowEditDialog } from "@/components/admin/row-edit-dialog";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { formatNumber } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import type { StreakRuleRow } from "@/lib/dal/scoring-admin";

// SCR-054's attendance streak — REQ-REC-005: org-configurable, three check-ins
// in a calendar month for fifteen points by default. The window is the month;
// the count, the bonus and whether it runs are the admin's.

type Action = (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
const plain = (chunks: string) => chunks;

export function StreaksTable({ rules, action }: { rules: StreakRuleRow[]; action: Action }) {
  const t = useTranslations("recognition.admin");
  const columns: DataTableColumn<StreakRuleRow>[] = [
    {
      key: "streak",
      header: t("streaks.colStreak"),
      onCard: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-label text-fg-heading">{t("streaks.name")}</p>
          <p className="mt-0.5 text-caption text-fg-muted">{t.rich("streaks.rule", { count: r.requiredCount, value: formatNumber(r.requiredCount), bdi })}</p>
        </div>
      ),
    },
    { key: "bonus", header: t("streaks.colBonus"), onCard: true, cell: (r) => <span>{t.rich("streaks.bonus", { count: r.bonusPoints, value: formatNumber(r.bonusPoints), bdi })}</span> },
    {
      key: "status",
      header: t("streaks.colStatus"),
      onCard: true,
      cell: (r) => (r.enabled ? <Badge size="sm" tone="success">{t("common.enabled")}</Badge> : <Badge size="sm" tone="neutral" outline>{t("common.disabled")}</Badge>),
    },
    { key: "edit", header: t("badges.colActions"), onCard: true, cell: (r) => <StreakDialog rule={r} action={action} /> },
  ];
  return (
    <DataTable
      label={t("streaks.listLabel")}
      columns={columns}
      rows={rules}
      rowKey={(r) => r.id}
      empty={{ title: t("common.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }}
    />
  );
}

function StreakDialog({ rule, action }: { rule: StreakRuleRow; action: Action }) {
  const t = useTranslations("recognition.admin");
  const prefix = `streak-${rule.id}`;
  const labels: Record<string, string> = { requiredCount: t("streaks.requiredCountLabel"), bonusPoints: t("streaks.bonusPointsLabel") };
  return (
    <RowEditDialog
      triggerLabel={t("common.edit")}
      triggerName={t.markup("common.editName", { name: t("streaks.name"), bdi: plain })}
      title={t("streaks.editTitle")}
      closeLabel={t("common.close")}
      action={action}
      emptyState={emptySavedState()}
      savedToast={t("common.saved")}
      failedMessage={(key) => t(`streaks.errors.${key}`)}
      summaryTitle={t("common.summaryTitle")}
      summary={(state) => summaryErrors(state, { fields: ["requiredCount", "bonusPoints"], label: (f) => labels[f], message: (key) => t(`streaks.errors.${key}`), fieldId: (f) => `${prefix}-${f}` })}
      submitLabel={t("common.save")}
      pendingLabel={t("common.saving")}
      cancelLabel={t("common.cancel")}
    >
      {(state) => {
        const attempted = hasAttempted(state);
        const err = (field: string) => (state.errors[field] ? t(`streaks.errors.${state.errors[field]}`) : undefined);
        return (
          <>
            <input type="hidden" name="streakRuleId" value={rule.id} />
            <Field id={`${prefix}-requiredCount`} label={labels.requiredCount} hint={t("streaks.requiredCountHint")} required error={err("requiredCount")}>
              <Input name="requiredCount" type="number" inputMode="numeric" min={1} max={31} step={1} dir="ltr" className="w-28 text-center" defaultValue={attempted ? was(state, "requiredCount") : String(rule.requiredCount)} />
            </Field>
            <Field id={`${prefix}-bonusPoints`} label={labels.bonusPoints} required error={err("bonusPoints")}>
              <Input name="bonusPoints" type="number" inputMode="numeric" min={0} max={1000} step={1} dir="ltr" className="w-28 text-center" defaultValue={attempted ? was(state, "bonusPoints") : String(rule.bonusPoints)} />
            </Field>
            <Switch name="enabled" label={t("streaks.enabledLabel")} defaultChecked={attempted ? was(state, "enabled") === "on" : rule.enabled} />
          </>
        );
      }}
    </RowEditDialog>
  );
}
