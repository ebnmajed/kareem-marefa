"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { hasAttempted, summaryErrors, was, wasList } from "@/lib/form-state";
import { emptyNewOrgState, NEW_ORG_FIELDS, type NewOrgField, type NewOrgState } from "../state";

// SCR-081's form, in `PlatformOrgNew.dc.html`'s order — name, slug, domains, first admin — with what `create_org()`
// needs and the board leaves out (DEC-251, Q8): the CERTIFICATE PREFIX (`orgs.certificate_prefix` is not null), the
// domains as a LIST (one to ten, `create_org`'s `domains_required`), and the starting categories, ticked. No default
// language: there is no column and no parameter for one. And no promise of an email to the first admin —
// `create_org()` sends none, so the board's «يصله بريد عند الإنشاء» is not written.
//
// Kept (W26.2.2, N2 – N5): the Latin controls carry `dir="ltr"` on the control alone, so the label, hint and error
// stay in the page's direction; case is forgiven where the stored form is fixed (contract 4); `noValidate`, each
// error beside its field and in the summary, every value kept after a refusal (REQ-UIX-009 … 011, DEC-149 §1).

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
    <form action={formAction} noValidate className="max-w-md space-y-4">
      {hasAttempted(state) && summary.length > 0 ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}
      {state.formError ? (
        <Panel tone="error">
          <p role="alert" className="text-body text-fg-heading">
            {tErr(state.formError)}
          </p>
        </Panel>
      ) : null}

      <Field id="name" label={t("nameLabel")} required error={err("name")}>
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
        <Textarea name="domains" dir="ltr" rows={2} spellCheck={false} className="font-mono" defaultValue={was(state, "domains")} />
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

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="md" pending={pending}>
          {t("submit")}
        </SubmitButton>
        <ButtonLink href="/app/platform/orgs" variant="quiet" size="md">
          {t("cancel")}
        </ButtonLink>
      </div>
    </form>
  );
}
