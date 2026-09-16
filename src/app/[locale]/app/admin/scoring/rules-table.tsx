"use client";

import { useTranslations } from "next-intl";
import { DurationInput } from "@/components/admin/duration-input";
import { splitDuration, type DurationUnit } from "@/components/admin/duration";
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
import type { ScoringRule } from "@/lib/dal/scoring-admin";

// One group of SCR-053's fixed catalogue — rewards for attendees, rewards for
// presenters, or the deductions — on `ui/data-table`, each rule edited in its
// own dialog (`components/admin/row-edit-dialog.tsx`).
//
// ★ A deduction is shown and typed as its COST, a positive number, and stored
// negative: «خصم 5 نقاط», never a «-5» in a right-to-left field. At 0 it reads
// «لا خصم» and its status «مغلق» — `REQ-PTS-008`'s «off by default», which the
// enable switch alone never said: the seed stores every deduction ENABLED at 0.

const COOLDOWN_UNITS: readonly DurationUnit[] = ["seconds", "minutes", "hours", "days"];
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
const plain = (chunks: string) => chunks;

export function RulesTable({
  rules,
  kind,
  label,
  action,
}: {
  rules: ScoringRule[];
  kind: "reward" | "penalty";
  label: string;
  action: (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
}) {
  const t = useTranslations("scoring.admin");
  const penalty = kind === "penalty";

  const cooldownText = (seconds: number | null) => {
    if (!seconds) return <span className="text-fg-muted">{t("catalogue.noCooldown")}</span>;
    const { amount, unit } = splitDuration(seconds, "seconds", COOLDOWN_UNITS);
    return <span>{t.rich(`catalogue.cooldown.${unit}`, { count: amount, value: formatNumber(amount), bdi })}</span>;
  };

  const columns: DataTableColumn<ScoringRule>[] = [
    {
      key: "action",
      header: t("catalogue.colAction"),
      onCard: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-label text-fg-heading">{t(`actions.${r.actionKey}`)}</p>
          <p className="mt-0.5 text-caption text-fg-muted">{t.rich("catalogue.memberSees", { reason: r.reasonAr, bdi })}</p>
        </div>
      ),
    },
    {
      key: "points",
      header: penalty ? t("catalogue.colCost") : t("catalogue.colPoints"),
      onCard: true,
      cell: (r) => {
        const value = Math.abs(r.points);
        return <span>{t.rich(penalty ? "catalogue.cost" : "catalogue.points", { count: value, value: formatNumber(value), bdi })}</span>;
      },
    },
    {
      key: "cap",
      header: t("catalogue.colCap"),
      onCard: true,
      cell: (r) =>
        r.capPerSession ? (
          <span>{t.rich("catalogue.cap", { count: r.capPerSession, value: formatNumber(r.capPerSession), bdi })}</span>
        ) : (
          <span className="text-fg-muted">{t("catalogue.noCap")}</span>
        ),
    },
    { key: "cooldown", header: t("catalogue.colCooldown"), onCard: true, cell: (r) => cooldownText(r.cooldownSeconds) },
    {
      key: "status",
      header: t("catalogue.colStatus"),
      onCard: true,
      cell: (r) =>
        penalty && r.points === 0 ? (
          <Badge tone="neutral" outline size="sm">
            {t("catalogue.closed")}
          </Badge>
        ) : r.enabled ? (
          <Badge tone="success" size="sm">
            {t("catalogue.enabled")}
          </Badge>
        ) : (
          <Badge tone="neutral" outline size="sm">
            {t("catalogue.disabled")}
          </Badge>
        ),
    },
    {
      key: "edit",
      header: t("catalogue.colEdit"),
      onCard: true,
      cell: (r) => <RuleDialog rule={r} penalty={penalty} action={action} />,
    },
  ];

  return (
    <DataTable
      label={label}
      columns={columns}
      rows={rules}
      rowKey={(r) => r.id}
      empty={{ title: t("catalogue.empty"), action: { label: t("catalogue.emptyAction"), href: "/app/admin/scoring#history-heading" } }}
    />
  );
}

const FIELDS = ["points", "capPerSession", "cooldown", "reasonAr"] as const;

function RuleDialog({ rule, penalty, action }: { rule: ScoringRule; penalty: boolean; action: (previous: SavedFormState, formData: FormData) => Promise<SavedFormState> }) {
  const t = useTranslations("scoring.admin");
  const name = t(`actions.${rule.actionKey}`);
  const prefix = `rule-${rule.id}`;
  const ids: Record<(typeof FIELDS)[number], string> = {
    points: `${prefix}-points`,
    capPerSession: `${prefix}-cap`,
    cooldown: `${prefix}-cooldown`,
    reasonAr: `${prefix}-reason`,
  };
  const labels: Record<(typeof FIELDS)[number], string> = {
    points: penalty ? t("ruleDialog.costLabel") : t("ruleDialog.pointsLabel"),
    capPerSession: t("ruleDialog.capLabel"),
    cooldown: t("ruleDialog.cooldownLabel"),
    reasonAr: t("ruleDialog.reasonLabel"),
  };
  const cooldown = rule.cooldownSeconds ? splitDuration(rule.cooldownSeconds, "seconds", COOLDOWN_UNITS) : null;

  return (
    <RowEditDialog
      triggerLabel={t("ruleDialog.edit")}
      triggerName={t.markup("ruleDialog.editName", { action: name, bdi: plain })}
      title={t.rich("ruleDialog.title", { action: name, bdi })}
      description={t("ruleDialog.description")}
      closeLabel={t("ruleDialog.close")}
      action={action}
      emptyState={emptySavedState()}
      savedToast={t("ruleDialog.saved")}
      failedMessage={(key) => t(`ruleDialog.errors.${key}`)}
      summaryTitle={t("ruleDialog.summaryTitle")}
      summary={(state) =>
        summaryErrors(state, {
          fields: FIELDS,
          label: (field) => labels[field as (typeof FIELDS)[number]] ?? field,
          message: (key) => t(`ruleDialog.errors.${key}`),
          fieldId: (field) => ids[field as (typeof FIELDS)[number]] ?? field,
        })
      }
      submitLabel={t("ruleDialog.save")}
      pendingLabel={t("ruleDialog.saving")}
      cancelLabel={t("ruleDialog.cancel")}
    >
      {(state) => {
        const attempted = hasAttempted(state);
        const value = (field: string, stored: string) => (attempted ? was(state, field) : stored);
        const err = (field: string) => (state.errors[field] ? t(`ruleDialog.errors.${state.errors[field]}`) : undefined);
        return (
          <>
            <input type="hidden" name="ruleId" value={rule.id} />
            <input type="hidden" name="kind" value={penalty ? "penalty" : "reward"} />
            <Field id={ids.points} label={labels.points} hint={penalty ? t("ruleDialog.costHint") : t("ruleDialog.pointsHint")} required error={err("points")}>
              <Input name="points" type="number" inputMode="numeric" min={0} max={1000} step={1} dir="ltr" className="w-32 text-center" defaultValue={value("points", String(Math.abs(rule.points)))} />
            </Field>
            <Field id={ids.capPerSession} label={labels.capPerSession} hint={t("ruleDialog.capHint")} error={err("capPerSession")}>
              <Input name="capPerSession" type="number" inputMode="numeric" min={1} max={1000} step={1} dir="ltr" className="w-32 text-center" defaultValue={value("capPerSession", rule.capPerSession ? String(rule.capPerSession) : "")} />
            </Field>
            <Field id={ids.cooldown} label={labels.cooldown} hint={t("ruleDialog.cooldownHint")} error={err("cooldown")}>
              <DurationInput
                label={labels.cooldown}
                amountName="cooldownAmount"
                unitName="cooldownUnit"
                units={COOLDOWN_UNITS}
                defaultAmount={value("cooldownAmount", cooldown ? String(cooldown.amount) : "")}
                defaultUnit={(value("cooldownUnit", cooldown?.unit ?? "minutes") || "minutes") as DurationUnit}
              />
            </Field>
            <Switch name="enabled" label={t("ruleDialog.enabledLabel")} defaultChecked={attempted ? was(state, "enabled") === "on" : rule.enabled} />
            <Field id={ids.reasonAr} label={labels.reasonAr} required error={err("reasonAr")}>
              <Input name="reasonAr" maxLength={200} defaultValue={value("reasonAr", rule.reasonAr)} />
            </Field>
          </>
        );
      }}
    </RowEditDialog>
  );
}
