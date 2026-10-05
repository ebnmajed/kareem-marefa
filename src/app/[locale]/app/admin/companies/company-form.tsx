"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ListEditorForm } from "@/components/admin/list-editor-form";
import { Button } from "@/components/ui/button";
import { DataTableSwatchCell } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/components/sessions/numerals";
import type { AdminCompany } from "@/lib/dal/admin-lists";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { COMPANY_FIELDS, NO_TEAM_COLOUR, emptyCompanyState, type CompanyConfirm, type CompanyField, type CompanyState } from "./state";
import { TEAM_COLOUR_HEX, TEAM_COLOUR_NAMES, teamColourNameOf } from "./team-colours";

// SCR-048's one form — create (`?new=1`) and edit (`?edit=<id>`), written for wave 22 from `AdminCompanies.dc.html`'s
// edit sheet. The name and the team colour: the seven named colours and «بلا لون», each a swatch AND its name in
// words, never a hex field (`REQ-UIX-043`). ★★ No logo field (`DEC-195` §4).
//
// ★ wave 27 (`DEC-254` §2, `REQ-ADM-024`): the company's DOMAINS, one per line, as `SCR-049`'s add sheet takes its
// addresses — `M11b.md`'s «the row's edit sheet holds … domains». LTR text in an RTL form: the textarea is `dir="ltr"`
// and every domain the form says back is `<bdi dir="ltr">`. A save that would move members first ASKS: a dialog with
// the two counts — who moves to this company, who stays because an admin placed them — opened from the action's own
// answer, whose confirm submits this same form with the dry run's token. If the population changed in between, the
// server says so and the dialog shows the new numbers.

const LABEL_KEY: Record<CompanyField, string> = { name: "nameLabel", teamColour: "teamColourLabel", domains: "domainsLabel" };
const FIELD_ID: Record<CompanyField, string> = { name: "company-name", teamColour: "company-team-colour", domains: "company-domains" };
const FORM_ID = "company-form";

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
      id={FORM_ID}
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
        const domainsError =
          state.domainErrors.length > 0 ? (
            <span className="flex flex-col gap-1">
              {state.domainErrors.map((e) => (
                <span key={`${e.domain}-${e.reason}`}>
                  {e.reason === "too_many"
                    ? t("errors.domainsTooMany")
                    : e.reason === "taken"
                      ? t.rich("errors.domainTaken", { domain: e.domain ?? "", company: e.company ?? "", d: (c) => <bdi dir="ltr">{c}</bdi>, t: (c) => <bdi>{c}</bdi> })
                      : t.rich("errors.domainMalformed", { domain: e.domain ?? "", d: (c) => <bdi dir="ltr">{c}</bdi> })}
                </span>
              ))}
            </span>
          ) : (
            err("domains")
          );
        return (
          <>
            <Field id={FIELD_ID.name} label={t("nameLabel")} required error={err("name")}>
              <Input name="name" defaultValue={attempted ? was(state, "name") : (company?.name ?? "")} maxLength={120} />
            </Field>
            <Field id={FIELD_ID.domains} label={t("domainsLabel")} hint={t("domainsHint")} error={domainsError}>
              <Textarea
                name="domains"
                rows={3}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                defaultValue={attempted ? was(state, "domains") : (company?.domains ?? []).join("\n")}
              />
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
            {state.confirm ? <input type="hidden" name="token" value={state.confirm.token} /> : null}
            <MoveConfirm confirm={state.confirm} />
          </>
        );
      }}
    </ListEditorForm>
  );
}

/** The question ruling 7 asks, opened by each new answer of the action; its confirm submits the form by `form=`. */
function MoveConfirm({ confirm }: { confirm: CompanyConfirm | null }) {
  const t = useTranslations("admin.companies");
  const [shown, setShown] = useState<CompanyConfirm | null>(null);
  const [open, setOpen] = useState(false);
  // Adjusted during render, never in an effect: a fresh answer opens the dialog once (wave 6's rule for dialogs).
  if (confirm !== shown) {
    setShown(confirm);
    setOpen(confirm !== null);
  }
  if (!confirm) return null;
  const name = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title={t.rich("moveTitle", { name: confirm.companyName, t: name })} closeLabel={t("closeDialog")}>
        <div className="space-y-2 text-body-sm text-fg-body">
          {confirm.changed ? <p className="font-bold text-fg-heading">{t("moveChanged")}</p> : null}
          <p>{t.rich("moveCount", { count: confirm.moving, value: formatNumber(confirm.moving), name: confirm.companyName, t: name, bdi: name })}</p>
          {confirm.held > 0 ? <p>{t.rich("heldCount", { count: confirm.held, value: formatNumber(confirm.held), bdi: name })}</p> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {/* ★ Never disabled from its own click: React flushes that update before the browser runs the button's
              activation, and a disabled submitter submits nothing (the wave-27 e2e found it). The action's answer
              closes the dialog (saved) or re-asks it (changed); the action queue serialises a second press. */}
          <Button type="submit" form={FORM_ID} name="confirm" value="1">
            {t("moveConfirm")}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("cancelDialogCancel")}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
