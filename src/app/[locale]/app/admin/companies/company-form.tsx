"use client";

import { useTranslations } from "next-intl";
import { ListEditorForm } from "@/components/admin/list-editor-form";
import { DataTableSwatchCell } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import type { AdminCompany } from "@/lib/dal/admin-lists";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { COMPANY_FIELDS, NO_TEAM_COLOUR, emptyCompanyState, type CompanyField, type CompanyState } from "./state";
import { TEAM_COLOUR_HEX, TEAM_COLOUR_NAMES, teamColourNameOf } from "./team-colours";

// SCR-048's one form — create (`?new=1`) and edit (`?edit=<id>`), written for wave 22 from `AdminCompanies.dc.html`'s
// edit sheet. The name and the team colour: the seven named colours and «بلا لون», each a swatch AND its name in
// words, never a hex field (`REQ-UIX-043`). ★★ No logo field and no domain field (`DEC-195` §4, `DEC-231` §6.1).

const LABEL_KEY: Record<CompanyField, string> = { name: "nameLabel", teamColour: "teamColourLabel" };
const FIELD_ID: Record<CompanyField, string> = { name: "company-name", teamColour: "company-team-colour" };

export function CompanyForm({
  action,
  company,
  closeHref,
}: {
  action: (prev: CompanyState, formData: FormData) => Promise<CompanyState>;
  company: AdminCompany | null;
  closeHref: string;
}) {
  const t = useTranslations("admin.companies");
  const stored = company ? (teamColourNameOf(company.teamColor) ?? NO_TEAM_COLOUR) : NO_TEAM_COLOUR;

  return (
    <ListEditorForm<CompanyState>
      action={action}
      emptyState={emptyCompanyState}
      closeHref={closeHref}
      savedLabel={t("saved")}
      failedMessage={(key) => t(`errors.${key}`)}
      summaryTitle={t("errorSummaryTitle")}
      summary={(state) =>
        summaryErrors(state, { fields: COMPANY_FIELDS, label: (f) => t(LABEL_KEY[f]), message: (key) => t(`errors.${key}`), fieldId: (f) => FIELD_ID[f] })
      }
      submitLabel={t("save")}
      pendingLabel={t("saving")}
    >
      {(state) => {
        const attempted = hasAttempted(state) && !state.saved;
        const err = (field: CompanyField) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
        return (
          <>
            <Field id={FIELD_ID.name} label={t("nameLabel")} required error={err("name")}>
              <Input name="name" defaultValue={attempted ? was(state, "name") : (company?.name ?? "")} maxLength={120} />
            </Field>
            <div id={FIELD_ID.teamColour} tabIndex={-1}>
              <RadioGroup
                name="teamColour"
                legend={t("teamColourLabel")}
                defaultValue={attempted ? was(state, "teamColour") || NO_TEAM_COLOUR : stored}
                invalid={Boolean(err("teamColour"))}
                error={err("teamColour")}
                options={[
                  ...TEAM_COLOUR_NAMES.map((name) => ({
                    value: name,
                    label: <DataTableSwatchCell color={TEAM_COLOUR_HEX[name]} colorName={t(`teamColourNames.${name}`)} />,
                  })),
                  { value: NO_TEAM_COLOUR, label: <DataTableSwatchCell color={null} colorName={t("teamColourNone")} /> },
                ]}
              />
            </div>
          </>
        );
      }}
    </ListEditorForm>
  );
}
