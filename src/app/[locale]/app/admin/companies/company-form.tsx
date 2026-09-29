"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { COMPANY_FIELDS, COMPANY_REQUIRED_FIELDS, NO_TEAM_COLOUR, emptyCompanyState, type CompanyField, type CompanyState } from "./state";
import { Swatch } from "./swatch";
import { TEAM_COLOUR_HEX, TEAM_COLOUR_NAMES } from "./team-colours";
import { FormAlert } from "@/components/admin/form-alert";

// SCR-048's add form, onto `lib/form-state`'s shared model for wave 7
// (`16` §8.2, `DEC-137`).
//
// ★ wave 16 (DEC-195 §3, REQ-UIX-043): the team colour is chosen here, while
// the company is added — the owner's model. The same seven names and «بلا لون»
// as the row's menu, each a swatch AND its name in words, never a hex field.
// «بلا لون» is the default: a company may have none.
//
// ★★ There is no logo field, and there will not be one (DEC-195 §4): a company
// is a name, a team colour, and active-or-deactivated.

const LABEL_KEY: Record<CompanyField, string> = { name: "nameLabel", teamColour: "teamColourLabel" };

const FIELD_ID: Record<CompanyField, string> = {
  name: "co-name",
  teamColour: "co-team-colour",
};

export function CompanyForm({ action }: { action: (prev: CompanyState, formData: FormData) => Promise<CompanyState> }) {
  const t = useTranslations("admin.companies");
  const [state, formAction, pending] = useActionState(action, emptyCompanyState);
  const err = (field: CompanyField) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const required = (field: CompanyField) => COMPANY_REQUIRED_FIELDS.includes(field);

  const summary = summaryErrors(state, {
    fields: COMPANY_FIELDS,
    label: (field) => t(LABEL_KEY[field]),
    message: (key) => t(`errors.${key}`),
    // ★ The summary's links target the CONTROL's id, which is the `<Field id>`
    // below — not the field's name. Without this map every link pointed at an
    // element that does not exist and focused nothing (wave 8, F4; REQ-UIX-009).
    fieldId: (field) => FIELD_ID[field],
  });

  return (
    <form action={formAction} noValidate className="mt-4 max-w-md space-y-5">
      {hasAttempted(state) ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}
      {state.formError ? (
        <FormAlert>
          {t(`errors.${state.formError}`)}
        </FormAlert>
      ) : null}

      <Field id="co-name" label={t("nameLabel")} required={required("name")} error={err("name")}>
        <Input name="name" defaultValue={was(state, "name")} maxLength={120} />
      </Field>

      <div id={FIELD_ID.teamColour} tabIndex={-1}>
        <RadioGroup
          name="teamColour"
          legend={t("teamColourLabel")}
          defaultValue={was(state, "teamColour") || NO_TEAM_COLOUR}
          invalid={Boolean(err("teamColour"))}
          error={err("teamColour")}
          options={[
            ...TEAM_COLOUR_NAMES.map((name) => ({
              value: name,
              label: (
                <span className="inline-flex items-center gap-2">
                  <Swatch hex={TEAM_COLOUR_HEX[name]} />
                  {t(`teamColourNames.${name}`)}
                </span>
              ),
            })),
            {
              value: NO_TEAM_COLOUR,
              label: (
                <span className="inline-flex items-center gap-2">
                  <Swatch hex={null} />
                  {t("teamColourNone")}
                </span>
              ),
            },
          ]}
        />
      </div>

      <Button type="submit" pending={pending}>
        {t("add")}
      </Button>
    </form>
  );
}
