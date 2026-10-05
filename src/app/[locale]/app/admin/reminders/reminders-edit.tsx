"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
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
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import { summaryErrors } from "@/lib/form-state";
import { UNITS, bandWords, type ReminderRowKey } from "./rows";
import { PROMPT_CONTROL_ID, amountField, emptyRemindersState, onField, rowControlId, unitField, type RemindersState } from "./state";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// SCR-060 in edit mode — `REQ-UIX-091`, `M10c.md` §1, `DEC-231` §3, `DEC-232` §1.3 and §3. Written from the
// artboard's table with `profile-edit.tsx` as the reference, read and never imported.
//
// ★ EDIT MODE NAMES ITS STATE: «تعديل التذكيرات», the count of unsaved changes, each changed field outlined in the
// accent AND «(معدّل)» in its accessible name — never colour alone (SC 1.4.1).
// ★ NOTHING IS WRITTEN BEFORE «احفظ». A row's switch STAGES its change (`DEC-232` §3.4); it is a real checkbox that
// posts with the form. ★ Not inside `data-table`: the primitive renders the table AND the phone stack, one hidden by
// CSS, so a control in a cell exists twice — two inputs posting one name, two elements with one id. Edit mode is a list
// of one fieldset per row in the table's columns; read mode is the `data-table` (`reminders-table.tsx`).
// ★ THE SAVED MARK IS THE SERVER'S RECEIPT: «حُفظ» only when the save wrote history rows, «لم يتغيّر شيء» when it wrote
// none; then back to read mode, whose mark is read from those rows. A refusal keeps edit mode, the error at its row.
// ★ «احفظ» is enabled in the server's HTML (a save pressed before hydration still posts); hydrated, it waits for a change.
// ★ LEAVING WITH CHANGES ASKS: a dialog for an in-page link, the browser's own question on reload.

export interface EditRow {
  key: ReminderRowKey;
  /** «التذكير قبل الجلسة بأسبوع» — names the row's controls, since all three read «قبل الجلسة». */
  name: string;
  reminder: string;
  minutes: number;
  on: boolean;
  channels: string;
}

interface OtherRow {
  id: string;
  reminder: string;
  timing: ReactNode;
  channels: string;
  enabled: string;
}

type Timing = { amount: string; unit: DurationUnit };
type RowState = { on: boolean } & Timing;

const timingOf = (minutes: number): Timing => {
  const { amount, unit } = splitDuration(minutes, "minutes", UNITS);
  return { amount: String(amount), unit };
};
const sameTiming = (a: Timing, b: Timing) => a.amount === b.amount && a.unit === b.unit;

export function RemindersEdit({
  action,
  rows,
  promptMinutes,
  promptChannels,
  others,
  opened,
}: {
  action: (previous: RemindersState, formData: FormData) => Promise<RemindersState>;
  rows: EditRow[];
  promptMinutes: number;
  promptChannels: string;
  others: OtherRow[];
  opened: { offsets: number[]; prompt: number };
}) {
  const t = useTranslations("notifications.admin.reminders");
  const tDialog = useTranslations("ui.dialog");
  const toast = useToast();
  const router = useRouter();
  const rawRouter = useRawRouter();
  const hydrated = useHydrated();

  const initial = Object.fromEntries(rows.map((r) => [r.key, { on: r.on, ...timingOf(r.minutes) }])) as Record<ReminderRowKey, RowState>;
  const initialPrompt = timingOf(promptMinutes);
  const [values, setValues] = useState(initial);
  const [prompt, setPrompt] = useState<Timing>(initialPrompt);

  // The toast and the way back are called FROM the action's own result, never from an effect keyed on the state
  // (`use-action-toast.ts` says why: the dispatching tree may be gone by the commit that would run it).
  const [state, formAction] = useActionState<RemindersState, FormData>(async (previous, formData) => {
    const result = await action(previous, formData);
    if (result.receipt) {
      toast.show({ title: result.receipt.wrote.length > 0 ? t("saved") : t("unchanged"), tone: result.receipt.wrote.length > 0 ? "success" : "info" });
      router.replace("/app/admin/reminders");
    }
    return result;
  }, emptyRemindersState);

  const changedRow = (key: ReminderRowKey) => {
    const now = values[key];
    const was = initial[key];
    return now.on !== was.on || (now.on && !sameTiming(now, was));
  };
  const promptChanged = !sameTiming(prompt, initialPrompt);
  const unsaved = rows.filter((r) => changedRow(r.key)).length + (promptChanged ? 1 : 0);
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
      // An in-page anchor — the error summary's link to a field — leaves nothing.
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

  // `markup`, not `t()`: the messages isolate their values in `<bdi>` (10 §3), and a label, an accessible name or a
  // summary line is a string — so the tag is dropped here and the isolation is the value's own.
  const plain = (chunks: string) => chunks;
  const message = (key: string) => {
    const band = key.match(/^band\.(week|day|hours)$/);
    if (!band) return t(`errors.${key}`);
    // Strings, through the numeral formatter: a bare number would let ICU format it in the locale's digits (DEC-124).
    const { min, max } = bandWords(band[1] as ReminderRowKey);
    return t.markup(`errors.${key}`, { min: formatNumber(min), max: formatNumber(max), bdi: plain });
  };
  const err = (field: string) => (state.errors[field] ? message(state.errors[field]) : undefined);
  const timingLabel = (name: string) => t.markup("timingLabel", { name, bdi: plain });
  const changedWord = (changed: boolean) => (changed ? ` ${t("changed")}` : "");
  const mark = (changed: boolean) => (changed ? "rounded-field outline-2 outline-accent" : "");
  const nameOf = (field: string) => (field === "prompt" ? t("names.prompt") : (rows.find((r) => r.key === field)?.name ?? field));

  const summary = summaryErrors(state, {
    fields: [...rows.map((r) => r.key), "prompt"],
    label: nameOf,
    message,
    fieldId: (field) => (field === "prompt" ? PROMPT_CONTROL_ID : rowControlId(field as ReminderRowKey)),
  });

  const header = "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_minmax(0,10rem)_5rem] md:items-start md:gap-3";

  const fixedRow = (row: EditRow) => {
    const { key, name } = row;
    const value = values[key];
    const changed = changedRow(key);
    const switchChanged = value.on !== initial[key].on;
    return (
      <li key={key}>
        <fieldset className={`min-w-0 ${header} flex flex-col gap-2 py-3`}>
          <legend className="sr-only">{name}</legend>
          <span className="text-body text-fg-body md:pt-3">{row.reminder}</span>
          <Field id={rowControlId(key)} label={<span className="sr-only">{`${timingLabel(name)}${changedWord(changed && value.on)}`}</span>} error={err(key)}>
            <div className={mark(changed && value.on)}>
              <DurationInput
                label={timingLabel(name)}
                amountName={amountField(key)}
                unitName={unitField(key)}
                units={UNITS}
                amount={value.amount}
                unit={value.unit}
                onAmountChange={(amount) => setValues((v) => ({ ...v, [key]: { ...v[key], amount } }))}
                onUnitChange={(unit) => setValues((v) => ({ ...v, [key]: { ...v[key], unit } }))}
              />
            </div>
          </Field>
          <span className="text-body-sm text-fg-muted md:pt-3">{row.channels}</span>
          <div className={`w-fit ${mark(switchChanged)}`}>
            {/* Staged, never written: the switch is a real checkbox that posts `<key>-on` with the form (`DEC-232` §3.4). */}
            <Switch
              name={onField(key)}
              label={`${t("columns.enabled")}${changedWord(switchChanged)} — ${name}`}
              labelHidden
              checked={value.on}
              onCheckedChange={(next) => setValues((v) => ({ ...v, [key]: { ...v[key], on: next } }))}
            />
          </div>
        </fieldset>
      </li>
    );
  };

  return (
    <section aria-labelledby="reminders-edit-heading" className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="reminders-edit-heading" className="text-h3 text-fg-heading">
          {t("editing")}
        </h2>
        <span aria-live="polite" className="text-caption font-bold text-accent">
          {unsaved > 0 ? t.rich("unsaved", { count: unsaved, value: formatNumber(unsaved), bdi: (chunks) => <bdi>{chunks}</bdi> }) : null}
        </span>
      </div>

      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="opened" value={JSON.stringify(opened)} />
        {state.formError ? (
          <p role="alert" className="flex items-start gap-2 rounded-field border border-error-border bg-error-bg p-4 text-caption text-error">
            <AlertCircleIcon className="mt-[0.2em]" />
            <span>{t(`errors.${state.formError}`)}</span>
          </p>
        ) : (
          <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} />
        )}

        <div className="rounded-panel border border-edge bg-surface px-4">
          <div aria-hidden="true" className={`hidden border-b border-edge py-2 text-label text-fg-muted ${header}`}>
            <span>{t("columns.reminder")}</span>
            <span>{t("columns.timing")}</span>
            <span>{t("columns.channels")}</span>
            <span>{t("columns.enabled")}</span>
          </div>
          <ul className="divide-y divide-edge">
            {rows.map(fixedRow)}
            <li>
              <fieldset className={`min-w-0 ${header} flex flex-col gap-2 py-3`}>
                <legend className="sr-only">{t("names.prompt")}</legend>
                <span className="text-body text-fg-body md:pt-3">{t("rows.prompt")}</span>
                <Field id={PROMPT_CONTROL_ID} label={<span className="sr-only">{`${timingLabel(t("names.prompt"))}${changedWord(promptChanged)}`}</span>} error={err("prompt")}>
                  <div className={mark(promptChanged)}>
                    <DurationInput
                      label={timingLabel(t("names.prompt"))}
                      amountName="promptAmount"
                      unitName="promptUnit"
                      units={UNITS}
                      amount={prompt.amount}
                      unit={prompt.unit}
                      onAmountChange={(amount) => setPrompt({ ...prompt, amount })}
                      onUnitChange={(unit) => setPrompt({ ...prompt, unit })}
                    />
                  </div>
                </Field>
                <span className="text-body-sm text-fg-muted md:pt-3">{promptChannels}</span>
                <span className="text-body-sm text-fg-body md:pt-3">{t("state.on")}</span>
              </fieldset>
            </li>
            {others.map((other) => (
              <li key={other.id} className={`${header} flex flex-col gap-1 py-3 text-fg-muted`}>
                <span className="text-body">{other.reminder}</span>
                <span className="text-body-sm">{other.timing}</span>
                <span className="text-body-sm">{other.channels}</span>
                <span className="text-body-sm">{other.enabled}</span>
              </li>
            ))}
          </ul>
        </div>

        <ActionBar
          position="static"
          label={t("actions")}
          primary={
            <SubmitButton pendingLabel={t("saving")} disabled={hydrated && !dirty}>
              {unsaved > 0 ? `${t("save")} (${formatNumber(unsaved)})` : t("save")}
            </SubmitButton>
          }
          secondary={[
            <ButtonLink key="cancel" href="/app/admin/reminders" variant="secondary" size="lg">
              {t("cancel")}
            </ButtonLink>,
          ]}
        />
      </form>

      <Dialog open={leavingTo !== null} onOpenChange={(open) => (open ? null : setLeavingTo(null))}>
        <DialogContent title={t("leave.title")} closeLabel={tDialog("close")}>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="md"
              onClick={() => {
                const to = leavingTo;
                setLeavingTo(null);
                // An href read off the page already carries its locale, so the plain router, not next-intl's.
                if (to) rawRouter.push(to);
              }}
            >
              {t("leave.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("leave.stay")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
