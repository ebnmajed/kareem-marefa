"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DurationInput } from "@/components/admin/duration-input";
import { splitDuration, type DurationUnit } from "@/components/admin/duration";
import { useActionToast } from "@/components/admin/use-action-toast";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { IconButton } from "@/components/ui/icon-button";
import { AlertCircleIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { hasAttempted, summaryErrors } from "@/lib/form-state";
import {
  MAX_OFFSETS,
  PROMPT_CONTROL_ID,
  emptyRemindersState,
  offsetControlId,
  offsetField,
  type RemindersState,
} from "./state";

// SCR-060's form — REQ-ADM-016, REQ-NTF-004, on the form model (`16` §8.2).
//
// The offsets are ROWS — a number and a unit each, added and removed — rather
// than the comma-separated list of minutes this screen used to take («10080,
// 1440, 120»). The rows are controlled state, so a refused save leaves them
// exactly as typed, and each row's error arrives at that row (`state.ts`
// explains the keys). After a successful save the page re-renders with the
// schedule as stored — sorted, in the largest unit that divides each offset —
// and the rows follow it.

const UNITS: readonly DurationUnit[] = ["minutes", "hours", "days"];

type Row = { key: string; amount: string; unit: DurationUnit };

function rowsFrom(offsetsMinutes: number[]): Row[] {
  return offsetsMinutes.map((minutes, i) => {
    const { amount, unit } = splitDuration(minutes, "minutes", UNITS);
    return { key: `r${i}`, amount: String(amount), unit };
  });
}

function promptFrom(minutes: number): { amount: string; unit: DurationUnit } {
  const { amount, unit } = splitDuration(minutes, "minutes", UNITS);
  return { amount: String(amount), unit };
}

export function RemindersForm({
  action,
  offsetsMinutes,
  promptMinutes,
}: {
  action: (previous: RemindersState, formData: FormData) => Promise<RemindersState>;
  offsetsMinutes: number[];
  promptMinutes: number;
}) {
  const t = useTranslations("notifications.admin.reminders");
  const [state, formAction] = useActionToast(action, emptyRemindersState, (result) =>
    result.saved ? { title: t("saved"), tone: "success" } : result.formError ? { title: t(`errors.${result.formError}`), tone: "error" } : null,
  );

  const stored = `${offsetsMinutes.join(",")}|${promptMinutes}`;
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(offsetsMinutes));
  const [prompt, setPrompt] = useState(() => promptFrom(promptMinutes));
  const [nextKey, setNextKey] = useState(offsetsMinutes.length);
  // The stored schedule changed under the form — a save landed — so the rows
  // follow it. Adjusted during render, not in an effect (react.dev's pattern).
  const [seenStored, setSeenStored] = useState(stored);
  if (seenStored !== stored) {
    setSeenStored(stored);
    setRows(rowsFrom(offsetsMinutes));
    setPrompt(promptFrom(promptMinutes));
    setNextKey(offsetsMinutes.length);
  }

  // Focus follows the member's own action: to a row they just added, or to
  // the row above one they just removed — never lost to <body>.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const err = (field: string) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  // `markup`, not a plain `t()`: the message isolates the number in `<bdi>`
  // (10 §3), and a label or an accessible name is a string, so the tag is
  // dropped here and the isolation is the digits' own.
  const plain = (chunks: string) => chunks;
  const labelFor = (i: number) => t.markup("offsetLabel", { n: formatNumber(i + 1), bdi: plain });

  function update(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function add() {
    const key = `r${nextKey}`;
    setNextKey(nextKey + 1);
    setRows([...rows, { key, amount: "", unit: "hours" }]);
    focusNext.current = offsetControlId(key);
  }
  function remove(index: number) {
    const neighbour = rows[index - 1] ?? rows[index + 1];
    setRows(rows.filter((_, i) => i !== index));
    if (neighbour) focusNext.current = offsetControlId(neighbour.key);
  }

  const summary = summaryErrors(state, {
    fields: [...rows.map((row) => offsetField(row.key)), "offsets", "prompt"],
    label: (field) => {
      if (field === "prompt") return t("promptLabel");
      if (field === "offsets") return t("offsetsLegend");
      const index = rows.findIndex((row) => offsetField(row.key) === field);
      return index >= 0 ? labelFor(index) : t("offsetsLegend");
    },
    message: (key) => t(`errors.${key}`),
    fieldId: (field) => (field === "prompt" ? PROMPT_CONTROL_ID : field === "offsets" ? "reminder-add" : `reminder-${field}`),
  });

  return (
    <form action={formAction} noValidate className="mt-8 max-w-2xl space-y-8">
      {hasAttempted(state) ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}

      <fieldset>
        <legend className="text-h3 text-fg-heading">{t("offsetsLegend")}</legend>
        <p className="mt-1 text-body-sm text-fg-muted">{t("offsetsHint")}</p>

        <ol className="mt-4 space-y-4">
          {rows.map((row, i) => (
            <li key={row.key} className="flex items-start gap-2">
              <input type="hidden" name="offsetKey" value={row.key} />
              <Field id={offsetControlId(row.key)} label={labelFor(i)} error={err(offsetField(row.key))} className="min-w-0 flex-1">
                <DurationInput
                  label={labelFor(i)}
                  amountName="offsetAmount"
                  unitName="offsetUnit"
                  units={UNITS}
                  amount={row.amount}
                  unit={row.unit}
                  onAmountChange={(amount) => update(row.key, { amount })}
                  onUnitChange={(unit) => update(row.key, { unit })}
                />
              </Field>
              {/* Not rendered for the last row, rather than disabled: a
                  schedule with no reminder is not a state to offer (`16` §3,
                  principle 7). Aligned with the controls, below the label. */}
              {rows.length > 1 ? (
                <IconButton label={t.markup("removeOffset", { n: formatNumber(i + 1), bdi: plain })} className="mt-8" onClick={() => remove(i)}>
                  <TrashIcon />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ol>

        {rows.length < MAX_OFFSETS ? (
          <Button id="reminder-add" type="button" variant="secondary" size="sm" className="mt-4" iconStart={<PlusIcon />} onClick={add}>
            {t("addOffset")}
          </Button>
        ) : (
          <p id="reminder-add" tabIndex={-1} className="mt-4 text-body-sm text-fg-muted">
            {t("offsetsMax")}
          </p>
        )}
        {err("offsets") ? (
          <p className="mt-2 flex items-start gap-2 text-caption text-error">
            <AlertCircleIcon className="mt-[0.2em]" />
            <span>{err("offsets")}</span>
          </p>
        ) : null}

        <Panel className="mt-4">
          <p className="text-body-sm text-fg-body">{t("genericNote")}</p>
        </Panel>
      </fieldset>

      <Field id={PROMPT_CONTROL_ID} label={t("promptLabel")} hint={t("promptHint")} error={err("prompt")}>
        <DurationInput
          label={t("promptLabel")}
          amountName="promptAmount"
          unitName="promptUnit"
          units={UNITS}
          amount={prompt.amount}
          unit={prompt.unit}
          onAmountChange={(amount) => setPrompt({ ...prompt, amount })}
          onUnitChange={(unit) => setPrompt({ ...prompt, unit })}
        />
      </Field>

      {state.formError ? (
        <p role="alert" className="flex items-start gap-2 text-body-sm text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{t(`errors.${state.formError}`)}</span>
        </p>
      ) : null}

      <SubmitButton pendingLabel={t("saving")}>{t("save")}</SubmitButton>
    </form>
  );
}
