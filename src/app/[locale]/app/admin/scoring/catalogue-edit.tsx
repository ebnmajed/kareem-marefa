"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter as useRawRouter } from "next/navigation";
import { DurationInput } from "@/components/admin/duration-input";
import { splitDuration, type DurationUnit } from "@/components/admin/duration";
import { formatNumber } from "@/components/sessions/numerals";
import { ActionBar } from "@/components/ui/action-bar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import { summaryErrors } from "@/lib/form-state";
import type { CatalogueRow } from "./catalogue-table";
import { COOLDOWN_UNITS, companyField, emptyCatalogueState, ruleField, type CatalogueState, type Opened } from "./state";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// SCR-053 in EDIT mode — `REQ-UIX-091`, `REQ-UIX-100`, `DEC-231` §3, `DEC-232` §3. Written from the artboard's tables
// with `profile-edit.tsx` as the reference, read and never imported, in the shape `060` set (`583eedbc`).
//
// ★ EDIT MODE NAMES ITS STATE: «تعديل النقاط», the count of unsaved changes, each changed field outlined in the accent
// AND «(معدّل)» in its accessible name — never colour alone (SC 1.4.1).
// ★ NOTHING IS WRITTEN BEFORE «احفظ». A rule's switch STAGES its change: a real checkbox posted with the form
// (`DEC-232` §3.4). ★ Not inside `data-table`: the primitive renders the table AND the phone stack, so a control in a
// cell would exist twice — two inputs posting one name. Edit mode is one fieldset per rule in the table's columns.
// ★ ONE SAVE, ONE TRANSACTION, AND ITS RECEIPT: «حُفظ» only when the save wrote history rows, «لم يتغيّر شيء» when it
// wrote none; then back to read mode, whose mark is read from those rows. A refusal keeps edit mode, at its field.
// ★ «احفظ» is enabled in the server's HTML (a save pressed before hydration still posts); hydrated, it waits for a change.
// ★ LEAVING WITH CHANGES ASKS: a dialog for an in-page link, the browser's own question on reload.

export interface EditableRule extends CatalogueRow {
  version: number;
}
export interface EditableCompanyRule {
  id: string;
  actionKey: "company_hosting" | "company_attendance_pct" | "company_presenting_pct";
  name: string;
  version: number;
  enabled: boolean;
  points: number | null;
  pointsPerPercent: number | null;
  capPoints: number | null;
  minActiveMembers: number | null;
}

type RuleValues = { points: string; cap: string; cooldownAmount: string; cooldownUnit: DurationUnit; enabled: boolean; reason: string };
type CompanyValues = { points: string; perPercent: string; capPoints: string; minActive: string; enabled: boolean };

const ruleValues = (r: EditableRule): RuleValues => {
  const cooldown = r.cooldownSeconds ? splitDuration(r.cooldownSeconds, "seconds", COOLDOWN_UNITS) : { amount: null, unit: "minutes" as DurationUnit };
  return {
    points: String(Math.abs(r.points)),
    cap: r.capPerSession === null ? "" : String(r.capPerSession),
    cooldownAmount: cooldown.amount === null ? "" : String(cooldown.amount),
    cooldownUnit: cooldown.unit,
    enabled: r.enabled,
    reason: r.reason,
  };
};
const companyValues = (r: EditableCompanyRule): CompanyValues => ({
  points: r.points === null ? "" : String(r.points),
  perPercent: r.pointsPerPercent === null ? "" : String(r.pointsPerPercent),
  capPoints: r.capPoints === null ? "" : String(r.capPoints),
  minActive: r.minActiveMembers === null ? "" : String(r.minActiveMembers),
  enabled: r.enabled,
});

const plain = (chunks: string) => chunks;

export function CatalogueEdit({
  action,
  groups,
  company,
  opened,
}: {
  action: (previous: CatalogueState, formData: FormData) => Promise<CatalogueState>;
  groups: { id: string; heading: string | null; rules: EditableRule[] }[];
  company: EditableCompanyRule[];
  opened: Opened;
}) {
  const t = useTranslations("scoring.admin");
  const tDialog = useTranslations("ui.dialog");
  const toast = useToast();
  const router = useRouter();
  const rawRouter = useRawRouter();
  const hydrated = useHydrated();

  const allRules = groups.flatMap((g) => g.rules);
  const [initialRules] = useState(() => Object.fromEntries(allRules.map((r) => [r.id, ruleValues(r)])) as Record<string, RuleValues>);
  const [initialCompany] = useState(() => Object.fromEntries(company.map((r) => [r.id, companyValues(r)])) as Record<string, CompanyValues>);
  const [rules, setRules] = useState(initialRules);
  const [companies, setCompanies] = useState(initialCompany);

  // The toast and the way back are called FROM the action's own result, never from an effect keyed on the state.
  const [state, formAction] = useActionState<CatalogueState, FormData>(async (previous, formData) => {
    const result = await action(previous, formData);
    if (result.receipt) {
      const wrote = result.receipt.wrote.length > 0;
      toast.show({ title: wrote ? t("read.saved") : t("read.unchanged"), tone: wrote ? "success" : "info" });
      router.replace("/app/admin/scoring");
    }
    return result;
  }, emptyCatalogueState);

  const ruleChanged = (id: string, field: keyof RuleValues) => {
    if (field === "cooldownAmount" || field === "cooldownUnit") {
      const now = rules[id];
      const was = initialRules[id];
      return now.cooldownAmount.trim() !== was.cooldownAmount || (now.cooldownAmount.trim() !== "" && now.cooldownUnit !== was.cooldownUnit);
    }
    return rules[id][field] !== initialRules[id][field];
  };
  const companyChanged = (id: string, field: keyof CompanyValues) => companies[id][field] !== initialCompany[id][field];

  const RULE_KEYS: (keyof RuleValues)[] = ["points", "cap", "cooldownAmount", "enabled", "reason"];
  const COMPANY_KEYS: (keyof CompanyValues)[] = ["points", "perPercent", "capPoints", "minActive", "enabled"];
  const unsaved =
    allRules.reduce((n, r) => n + RULE_KEYS.filter((k) => ruleChanged(r.id, k)).length, 0) +
    company.reduce((n, r) => n + COMPANY_KEYS.filter((k) => companyChanged(r.id, k)).length, 0);
  const dirty = unsaved > 0 && !state.receipt;

  // ★ Leaving with changes asks.
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      event.preventDefault();
      event.stopPropagation();
      setLeavingTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const err = (name: string) => (state.errors[name] ? t(`read.errors.${state.errors[name]}`) : undefined);
  const changedWord = (changed: boolean) => (changed ? ` ${t("read.changed")}` : "");
  const mark = (changed: boolean) => (changed ? "rounded-field outline-2 outline-accent" : "");
  const named = (key: string, name: string) => t.markup(key, { name, bdi: plain });

  const labelOf: Record<string, string> = {};
  for (const r of allRules) {
    labelOf[ruleField(r.id, "points")] = named(r.penalty ? "read.costOf" : "read.valueOf", r.name);
    labelOf[ruleField(r.id, "cap")] = named("read.capOf", r.name);
    labelOf[ruleField(r.id, "cooldownAmount")] = named("read.cooldownOf", r.name);
    labelOf[ruleField(r.id, "reason")] = named("read.reasonOf", r.name);
  }
  for (const r of company) {
    labelOf[companyField(r.id, "points")] = named("read.valueOf", r.name);
    labelOf[companyField(r.id, "perPercent")] = named("read.perPercentOf", r.name);
    labelOf[companyField(r.id, "capPoints")] = named("read.capOf", r.name);
    labelOf[companyField(r.id, "minActive")] = named("read.minActiveOf", r.name);
  }
  const summary = summaryErrors(state, {
    fields: Object.keys(labelOf),
    label: (field) => labelOf[field] ?? field,
    message: (key) => t(`read.errors.${key}`),
    fieldId: (field) => field,
  });

  const columns = "md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_4rem] md:items-start md:gap-3";

  const ruleRow = (r: EditableRule) => {
    const v = rules[r.id];
    const set = (patch: Partial<RuleValues>) => setRules((all) => ({ ...all, [r.id]: { ...all[r.id], ...patch } }));
    const c = (field: keyof RuleValues) => ruleChanged(r.id, field);
    return (
      <li key={r.id}>
        <fieldset className={`min-w-0 ${columns} flex flex-col gap-2 py-3`}>
          <legend className="sr-only">{r.name}</legend>
          <div className="flex flex-col gap-1">
            <span className="text-body text-fg-heading">{r.name}</span>
            <Field id={ruleField(r.id, "reason")} label={<span className="sr-only">{`${labelOf[ruleField(r.id, "reason")]}${changedWord(c("reason"))}`}</span>} error={err(ruleField(r.id, "reason"))}>
              <Input name={ruleField(r.id, "reason")} value={v.reason} maxLength={200} onChange={(e) => set({ reason: e.target.value })} className={mark(c("reason"))} />
            </Field>
          </div>
          <Field id={ruleField(r.id, "points")} label={<span className="sr-only">{`${labelOf[ruleField(r.id, "points")]}${changedWord(c("points"))}`}</span>} error={err(ruleField(r.id, "points"))}>
            <Input name={ruleField(r.id, "points")} value={v.points} inputMode="numeric" dir="ltr" onChange={(e) => set({ points: e.target.value })} className={`text-center ${mark(c("points"))}`} />
          </Field>
          <Field id={ruleField(r.id, "cap")} label={<span className="sr-only">{`${labelOf[ruleField(r.id, "cap")]}${changedWord(c("cap"))}`}</span>} error={err(ruleField(r.id, "cap"))}>
            <Input name={ruleField(r.id, "cap")} value={v.cap} inputMode="numeric" dir="ltr" placeholder="—" onChange={(e) => set({ cap: e.target.value })} className={`text-center ${mark(c("cap"))}`} />
          </Field>
          <Field id={ruleField(r.id, "cooldownAmount")} label={<span className="sr-only">{`${labelOf[ruleField(r.id, "cooldownAmount")]}${changedWord(c("cooldownAmount"))}`}</span>} error={err(ruleField(r.id, "cooldownAmount"))}>
            <div className={mark(c("cooldownAmount"))}>
              <DurationInput
                label={labelOf[ruleField(r.id, "cooldownAmount")]}
                amountName={ruleField(r.id, "cooldownAmount")}
                unitName={ruleField(r.id, "cooldownUnit")}
                units={COOLDOWN_UNITS}
                amount={v.cooldownAmount}
                unit={v.cooldownUnit}
                onAmountChange={(cooldownAmount) => set({ cooldownAmount })}
                onUnitChange={(cooldownUnit) => set({ cooldownUnit })}
              />
            </div>
          </Field>
          <div className={`w-fit md:pt-2 ${mark(c("enabled"))}`}>
            {/* Staged, never written: a real checkbox that posts with the form (`DEC-232` §3.4). */}
            <Switch
              name={ruleField(r.id, "enabled")}
              label={`${t("read.colEnabled")}${changedWord(c("enabled"))} — ${r.name}`}
              labelHidden
              checked={v.enabled}
              onCheckedChange={(enabled) => set({ enabled })}
            />
          </div>
        </fieldset>
      </li>
    );
  };

  const companyRow = (r: EditableCompanyRule) => {
    const v = companies[r.id];
    const set = (patch: Partial<CompanyValues>) => setCompanies((all) => ({ ...all, [r.id]: { ...all[r.id], ...patch } }));
    const c = (field: keyof CompanyValues) => companyChanged(r.id, field);
    const number = (field: "points" | "perPercent" | "capPoints" | "minActive", decimal = false) => (
      <Field
        id={companyField(r.id, field)}
        label={`${labelOf[companyField(r.id, field)]}${changedWord(c(field))}`}
        error={err(companyField(r.id, field))}
      >
        <Input
          name={companyField(r.id, field)}
          value={v[field]}
          inputMode={decimal ? "decimal" : "numeric"}
          dir="ltr"
          onChange={(e) => set({ [field]: e.target.value })}
          className={`w-32 text-center ${mark(c(field))}`}
        />
      </Field>
    );
    return (
      <li key={r.id}>
        <fieldset className="flex min-w-0 flex-wrap items-end gap-4 py-3">
          <legend className="sr-only">{r.name}</legend>
          <span className="w-full text-body text-fg-heading md:w-48">{r.name}</span>
          {r.actionKey === "company_hosting" ? (
            number("points")
          ) : (
            <>
              {number("perPercent", true)}
              {number("capPoints")}
              {number("minActive")}
            </>
          )}
          <div className={`w-fit pb-2 ${mark(c("enabled"))}`}>
            <Switch
              name={companyField(r.id, "enabled")}
              label={`${t("read.colEnabled")}${changedWord(c("enabled"))} — ${r.name}`}
              labelHidden
              checked={v.enabled}
              onCheckedChange={(enabled) => set({ enabled })}
            />
          </div>
        </fieldset>
      </li>
    );
  };

  return (
    <section aria-labelledby="catalogue-edit-heading" className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="catalogue-edit-heading" className="text-h3 text-fg-heading">
          {t("read.editing")}
        </h2>
        <span aria-live="polite" className="text-caption font-bold text-accent">
          {unsaved > 0 ? t.rich("read.unsaved", { count: unsaved, value: formatNumber(unsaved), bdi: (chunks) => <bdi>{chunks}</bdi> }) : null}
        </span>
      </div>

      <form action={formAction} noValidate className="flex flex-col gap-6">
        <input type="hidden" name="opened" value={JSON.stringify(opened)} />
        {state.formError ? (
          <p role="alert" className="flex items-start gap-2 rounded-field border border-error-border bg-error-bg p-4 text-caption text-error">
            <AlertCircleIcon className="mt-[0.2em]" />
            <span>{t(`read.errors.${state.formError}`)}</span>
          </p>
        ) : (
          <FormSummary key={state.attempt} title={t("read.errorSummaryTitle")} errors={summary} />
        )}

        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            {group.heading ? <h3 className="text-label text-fg-heading">{group.heading}</h3> : null}
            <div className="rounded-panel border border-edge bg-surface px-4">
              <div aria-hidden="true" className={`hidden border-b border-edge py-2 text-label text-fg-muted ${columns}`}>
                <span>{t("read.colAction")}</span>
                <span>{t("read.colValue")}</span>
                <span>{t("read.colCap")}</span>
                <span>{t("read.colCooldown")}</span>
                <span>{t("read.colEnabled")}</span>
              </div>
              <ul className="divide-y divide-edge">{group.rules.map(ruleRow)}</ul>
            </div>
          </div>
        ))}

        <div id="company-rules" className="flex flex-col gap-2">
          <h3 className="text-label text-fg-heading">{t("read.companies")}</h3>
          <div className="rounded-panel border border-edge bg-surface px-4">
            <ul className="divide-y divide-edge">{company.map(companyRow)}</ul>
          </div>
        </div>

        <ActionBar
          position="static"
          label={t("read.actions")}
          primary={
            <SubmitButton pendingLabel={t("read.saving")} disabled={hydrated && !dirty}>
              {unsaved > 0 ? `${t("read.save")} (${formatNumber(unsaved)})` : t("read.save")}
            </SubmitButton>
          }
          secondary={[
            <ButtonLink key="cancel" href="/app/admin/scoring" variant="secondary" size="lg">
              {t("read.cancel")}
            </ButtonLink>,
          ]}
        />
      </form>

      <Dialog open={leavingTo !== null} onOpenChange={(open) => (open ? null : setLeavingTo(null))}>
        <DialogContent title={t("read.leave.title")} closeLabel={tDialog("close")}>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="md"
              onClick={() => {
                const to = leavingTo;
                setLeavingTo(null);
                if (to) rawRouter.push(to);
              }}
            >
              {t("read.leave.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("read.leave.stay")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
