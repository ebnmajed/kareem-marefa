"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { hasAttempted, summaryErrors, was, wasList } from "@/lib/form-state";
import { emptyNewOrgState, NEW_ORG_FIELDS, type NewOrgField, type NewOrgState } from "../state";

// SCR-081's form — REQ-TEN-002, REQ-TEN-004, REQ-TEN-007, onto the form model
// (`16` §8.2) for wave 8 (`docs/plan/notes/platform.md` W8.4).
//
// Four of the six fields are Latin by nature: a slug, a certificate prefix, a
// list of domains and an email address. Each carries `dir="ltr"` on the control
// alone, so the label, the hint and the error stay in the page's direction and
// only the typed value flips.
//
// Case is forgiven where the stored form is fixed anyway: the prefix is stored
// in capitals and the domains in lowercase (contract 4 — `org_domains_normalise`
// runs before the check), so neither refuses what the operator typed.
//
// `noValidate`: the app's own errors render beside their fields and in the
// summary, and every value survives a refused submit (REQ-UIX-009 … 011).

const LABEL_KEY: Record<NewOrgField, string> = {
  name: "nameLabel",
  slug: "slugLabel",
  certificatePrefix: "prefixLabel",
  domains: "domainsLabel",
  firstAdminEmail: "firstAdminLabel",
};

export function NewOrgForm({ action }: { action: (prev: NewOrgState, formData: FormData) => Promise<NewOrgState> }) {
  const t = useTranslations("platform.newOrg");
  const tErr = useTranslations("platform.errors");
  const [state, formAction, pending] = useActionState(action, emptyNewOrgState());
  const err = (field: NewOrgField) => (state.errors[field] ? tErr(state.errors[field]) : undefined);
  const summary = summaryErrors(state, {
    fields: NEW_ORG_FIELDS,
    label: (field) => t(LABEL_KEY[field]),
    message: (key) => tErr(key),
  });
  // Ticked on the first render; after a refused submit, whatever was sent.
  const seeded = hasAttempted(state) ? wasList(state, "seedCategories").length > 0 : true;

  return (
    <form action={formAction} noValidate className="max-w-2xl space-y-6">
      {hasAttempted(state) && summary.length > 0 ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}
      {state.formError ? (
        <Panel tone="error">
          <p role="alert" className="text-body text-fg-heading">
            {tErr(state.formError)}
          </p>
        </Panel>
      ) : null}

      <Field id="name" label={t("nameLabel")} hint={t("nameHint")} required error={err("name")}>
        <Input name="name" maxLength={120} defaultValue={was(state, "name")} />
      </Field>

      <Field id="slug" label={t("slugLabel")} hint={t("slugHint")} required error={err("slug")}>
        <Input name="slug" dir="ltr" autoComplete="off" spellCheck={false} maxLength={60} className="font-mono" defaultValue={was(state, "slug")} />
      </Field>

      <Field id="certificatePrefix" label={t("prefixLabel")} hint={t("prefixHint")} required error={err("certificatePrefix")}>
        <Input
          name="certificatePrefix"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          maxLength={5}
          className="max-w-40 font-mono uppercase"
          defaultValue={was(state, "certificatePrefix")}
        />
      </Field>

      <Field id="domains" label={t("domainsLabel")} hint={t("domainsHint")} required error={err("domains")}>
        <Textarea name="domains" dir="ltr" rows={3} spellCheck={false} className="font-mono" defaultValue={was(state, "domains")} />
      </Field>

      <Field id="firstAdminEmail" label={t("firstAdminLabel")} hint={t("firstAdminHint")} required error={err("firstAdminEmail")}>
        <Input name="firstAdminEmail" type="email" dir="ltr" autoComplete="off" maxLength={254} defaultValue={was(state, "firstAdminEmail")} />
      </Field>

      <Checkbox
        name="seedCategories"
        defaultChecked={seeded}
        label={
          <span className="flex flex-col">
            <span className="text-label text-fg-heading">{t("seedLabel")}</span>
            <span className="text-caption text-fg-muted">{t("seedHint")}</span>
          </span>
        }
      />

      <SubmitButton size="md" pending={pending}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
