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
import type { CompanyScoringRule } from "@/lib/dal/scoring-admin";

// SCR-053's company rules (`0081`) — hosting a session is a flat amount; the
// attendance and presenting shares are points per percentage point, capped,
// for a company large enough to count. The same list and dialog as the member
// catalogue beside it.

type Action = (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
const plain = (chunks: string) => chunks;

export function CompanyRulesTable({ rules, hostingAction, percentAction }: { rules: CompanyScoringRule[]; hostingAction: Action; percentAction: Action }) {
  const t = useTranslations("scoring.admin");

  const columns: DataTableColumn<CompanyScoringRule>[] = [
    {
      key: "rule",
      header: t("companyRules.colRule"),
      onCard: true,
      cell: (r) => <p className="text-label text-fg-heading">{t(`actions.${r.actionKey}`)}</p>,
    },
    {
      key: "values",
      header: t("companyRules.colValues"),
      onCard: true,
      cell: (r) =>
        r.actionKey === "company_hosting" ? (
          <span>{t.rich("companyRules.hostingValue", { count: r.points ?? 0, value: formatNumber(r.points ?? 0), bdi })}</span>
        ) : (
          <span className="inline-flex flex-col gap-0.5">
            <span>{t.rich("companyRules.perPercentValue", { value: formatNumber(r.pointsPerPercent ?? 0), bdi })}</span>
            <span>{t.rich("companyRules.capValue", { count: r.capPoints ?? 0, value: formatNumber(r.capPoints ?? 0), bdi })}</span>
            <span>{t.rich("companyRules.minValue", { count: r.minActiveMembers ?? 0, value: formatNumber(r.minActiveMembers ?? 0), bdi })}</span>
          </span>
        ),
    },
    {
      key: "status",
      header: t("catalogue.colStatus"),
      onCard: true,
      cell: (r) =>
        r.enabled ? (
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
      cell: (r) => <CompanyRuleDialog rule={r} action={r.actionKey === "company_hosting" ? hostingAction : percentAction} />,
    },
  ];

  return (
    <DataTable
      label={t("companyRules.listLabel")}
      columns={columns}
      rows={rules}
      rowKey={(r) => r.id}
      empty={{ title: t("catalogue.empty"), action: { label: t("catalogue.emptyAction"), href: "/app/admin/scoring#history-heading" } }}
    />
  );
}

function CompanyRuleDialog({ rule, action }: { rule: CompanyScoringRule; action: Action }) {
  const t = useTranslations("scoring.admin");
  const name = t(`actions.${rule.actionKey}`);
  const hosting = rule.actionKey === "company_hosting";
  const prefix = `company-rule-${rule.id}`;
  const fields = hosting ? ["points"] : ["pointsPerPercent", "capPoints", "minActiveMembers"];
  const labelOf = (field: string) => t(`companyRules.${field}Label`);

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
      failedMessage={(key) => t(`companyRules.errors.${key}`)}
      summaryTitle={t("ruleDialog.summaryTitle")}
      summary={(state) =>
        summaryErrors(state, {
          fields,
          label: labelOf,
          message: (key) => t(`companyRules.errors.${key}`),
          fieldId: (field) => `${prefix}-${field}`,
        })
      }
      submitLabel={t("ruleDialog.save")}
      pendingLabel={t("ruleDialog.saving")}
      cancelLabel={t("ruleDialog.cancel")}
    >
      {(state) => {
        const attempted = hasAttempted(state);
        const value = (field: string, stored: number | null) => (attempted ? was(state, field) : stored === null ? "" : String(stored));
        const err = (field: string) => (state.errors[field] ? t(`companyRules.errors.${state.errors[field]}`) : undefined);
        return (
          <>
            <input type="hidden" name="ruleId" value={rule.id} />
            {hosting ? (
              <Field id={`${prefix}-points`} label={labelOf("points")} hint={t("companyRules.pointsHint")} required error={err("points")}>
                <Input name="points" type="number" inputMode="numeric" min={0} max={10000} step={1} dir="ltr" className="w-32 text-center" defaultValue={value("points", rule.points)} />
              </Field>
            ) : (
              <>
                <Field id={`${prefix}-pointsPerPercent`} label={labelOf("pointsPerPercent")} hint={t("companyRules.pointsPerPercentHint")} required error={err("pointsPerPercent")}>
                  <Input name="pointsPerPercent" type="number" inputMode="decimal" min={0} max={100} step={0.01} dir="ltr" className="w-32 text-center" defaultValue={value("pointsPerPercent", rule.pointsPerPercent)} />
                </Field>
                <Field id={`${prefix}-capPoints`} label={labelOf("capPoints")} required error={err("capPoints")}>
                  <Input name="capPoints" type="number" inputMode="numeric" min={1} max={10000} step={1} dir="ltr" className="w-32 text-center" defaultValue={value("capPoints", rule.capPoints)} />
                </Field>
                <Field id={`${prefix}-minActiveMembers`} label={labelOf("minActiveMembers")} hint={t("companyRules.minActiveMembersHint")} required error={err("minActiveMembers")}>
                  <Input name="minActiveMembers" type="number" inputMode="numeric" min={1} max={1000} step={1} dir="ltr" className="w-32 text-center" defaultValue={value("minActiveMembers", rule.minActiveMembers)} />
                </Field>
              </>
            )}
            <Switch name="enabled" label={t("ruleDialog.enabledLabel")} defaultChecked={attempted ? was(state, "enabled") === "on" : rule.enabled} />
          </>
        );
      }}
    </RowEditDialog>
  );
}
