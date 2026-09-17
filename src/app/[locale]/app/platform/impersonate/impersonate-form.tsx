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

// SCR-085's form — REQ-ADM-002, REQ-ADM-019, DEC-014, `16` §8.2.
//
// ★ THE TOKEN IS REFRESHED IN THE SUBMIT PATH, NEVER IN AN EFFECT (wave 8, notes
// W8.0 F2). The claims a session carries are minted at issuance, so a started
// session reaches the token only when it is refreshed. The action no longer
// revalidates; this wrapper awaits the action, refreshes the session through
// the browser client (an AUTH operation — DEC-020) and only then re-renders the
// page, so the server sees the new cookie and the active panel replaces this
// form with the org already on the token. The race falls the safe way either
// way: until the refresh lands the operator is only a platform admin.
//
// ★ The duration is a set of presets ending at the table's ceiling, not a number
// field whose `max` only the browser enforced: one tap on a phone, and no way
// to ask for more than Postgres stores.
//
// `noValidate` — the app's own errors render beside their fields and in the
// summary; a native `required` would block the submit before they could.

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
    <form action={formAction} noValidate className="max-w-xl space-y-6">
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
        <RadioGroup
          name="minutes"
          legend={t("durationLegend")}
          defaultValue={was(state, "minutes") || String(DEFAULT_DURATION)}
          invalid={Boolean(state.errors.minutes)}
          options={DURATION_PRESETS.map((minutes) => ({
            value: String(minutes),
            label: duration(minutes),
            hint: minutes === DURATION_PRESETS[DURATION_PRESETS.length - 1] ? t("durationCeiling") : undefined,
          }))}
        />
        {err("minutes") ? <p className="mt-1 text-caption text-error">{err("minutes")}</p> : null}
      </div>

      <SubmitButton size="md" pending={pending}>
        {t("start")}
      </SubmitButton>
    </form>
  );
}
