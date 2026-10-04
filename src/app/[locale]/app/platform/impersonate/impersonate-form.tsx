"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Panel } from "@/components/ui/panel";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/components/sessions/numerals";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { createBrowserClient } from "@/lib/supabase/browser";
import {
  DEFAULT_DURATION,
  DURATION_PRESETS,
  emptyImpersonationState,
  IMPERSONATE_FIELDS,
  type ImpersonateField,
  type ImpersonationState,
} from "./state";

// SCR-085's form, as `PlatformImpersonate.dc.html` draws it: the org, the reason, the duration as a segmented row, and
// «ادخل» — REQ-ADM-002, REQ-ADM-019, DEC-014, `16` §8.2. ★ No member field (DEC-251, Q1): `start_impersonation()`
// takes an org, a reason and minutes, and nothing else.
//
// ★ THE TOKEN IS REFRESHED IN THE SUBMIT PATH, NEVER IN AN EFFECT (wave 8, F2). A started session reaches the token
// only when it is refreshed; the action does not revalidate, and this wrapper awaits it, refreshes the session through
// the browser client (an AUTH operation, DEC-020) and only then re-renders, so the server sees the new cookie. Until
// the refresh lands the operator is only a platform admin — the race falls the safe way.
//
// ★ The duration is today's five presets ending at the table's ceiling, one hour by default (DEC-251, Q2;
// `state.ts`, untouched) — one tap on a phone and no way to ask for more than Postgres stores; the board's three are
// its first three, and its segmented shape is `radio-group`'s `chips`.
//
// `noValidate` — the app's own errors render beside their fields and in the summary.

const LABEL_KEY: Record<ImpersonateField, string> = {
  orgId: "orgLabel",
  reason: "reasonLabel",
  minutes: "durationLegend",
};

export interface OrgOption {
  id: string;
  name: string;
}

export function ImpersonateForm({
  orgs,
  action,
}: {
  orgs: OrgOption[];
  action: (prev: ImpersonationState, formData: FormData) => Promise<ImpersonationState>;
}) {
  const t = useTranslations("platform.impersonate");
  const tErr = useTranslations("platform.errors");
  const router = useRouter();

  const [state, formAction, pending] = useActionState(async (prev: ImpersonationState, formData: FormData) => {
    const next = await action(prev, formData);
    if (next.started) {
      try {
        await createBrowserClient().auth.refreshSession();
      } finally {
        router.refresh();
      }
    }
    return next;
  }, emptyImpersonationState());

  const err = (field: ImpersonateField) => (state.errors[field] ? tErr(state.errors[field]) : undefined);
  const summary = summaryErrors(state, {
    fields: IMPERSONATE_FIELDS,
    label: (field) => t(LABEL_KEY[field]),
    message: (key) => tErr(key),
  });
  const duration = (minutes: number) =>
    minutes < 60
      ? t("durationMinutes", { count: minutes, value: formatNumber(minutes) })
      : t("durationHours", { count: minutes / 60, value: formatNumber(minutes / 60) });

  return (
    <form action={formAction} noValidate className="space-y-5">
      {hasAttempted(state) && summary.length > 0 ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}
      {state.formError ? (
        <Panel tone="error">
          <p role="alert" className="text-body text-fg-heading">
            {tErr(state.formError)}
          </p>
        </Panel>
      ) : null}

      <Field id="orgId" label={t("orgLabel")} required error={err("orgId")}>
        {/* The placeholder carries TEXT: an empty `<option>` renders as a blank
            line, which at 390 px reads as a broken control (wave 4's capture). */}
        <Select name="orgId" defaultValue={was(state, "orgId")}>
          <option value="" disabled>
            {t("orgPlaceholder")}
          </option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="reason" label={t("reasonLabel")} hint={t("reasonHint")} required error={err("reason")}>
        <Textarea name="reason" rows={3} maxLength={500} defaultValue={was(state, "reason")} />
      </Field>

      <div>
        {/* A chip's label never wraps (`whitespace-nowrap`); the ROW of five wraps when the column is narrower than
            the five — `radio-group`'s chip row is `flex` without `wrap`, so the wrap is set on it from here through
            its own `data-appearance` hook rather than by editing the primitive. */}
        <RadioGroup
          appearance="chips"
          className="[&_[data-appearance=chips]]:flex-wrap"
          name="minutes"
          legend={t("durationLegend")}
          defaultValue={was(state, "minutes") || String(DEFAULT_DURATION)}
          invalid={Boolean(state.errors.minutes)}
          options={DURATION_PRESETS.map((minutes) => ({ value: String(minutes), label: <span className="whitespace-nowrap">{duration(minutes)}</span> }))}
          error={err("minutes")}
        />
        {/* A chip carries no hint, so the ceiling is said once under the row (it was the last row's hint). */}
        <p className="mt-1.5 text-caption text-fg-muted">{t("durationCeiling")}</p>
      </div>

      <SubmitButton size="md" pending={pending}>
        {t("start")}
      </SubmitButton>
    </form>
  );
}
