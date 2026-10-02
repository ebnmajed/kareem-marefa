"use client";

import { useTranslations } from "next-intl";
import { ListEditorForm } from "@/components/admin/list-editor-form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AdminVenue } from "@/lib/dal/sessions";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { emptyVenueState, NO_COMPANY, VENUE_FIELDS, VENUE_REQUIRED_FIELDS, type VenueField, type VenueState } from "./state";

// SCR-046's one form — create (`?new=1`) and edit (`?edit=<id>`) — written for wave 22 from `AdminVenues.dc.html`'s
// edit sheet (`M11b.md` §046). ★ The company `select` (`REQ-ADM-022`): «لا شركة» first and a real, final choice, then
// the org's active companies; a deactivated owner is offered only to the venue it already owns, named as inactive —
// it earns no hosting points while it is (`DEC-232` §1.2).

const LABEL_KEY: Record<VenueField, string> = {
  name: "nameLabel",
  companyId: "companyLabel",
  address: "addressLabel",
  mapUrl: "mapLabelShort",
  capacity: "capacityLabel",
  timeZone: "timeZoneLabel",
  notes: "notesLabel",
};

export interface VenueCompanyOption {
  id: string;
  name: string;
  deactivated: boolean;
}

export function VenueForm({
  action,
  venue,
  companies,
  closeHref,
}: {
  action: (prev: VenueState, formData: FormData) => Promise<VenueState>;
  venue: AdminVenue | null;
  companies: VenueCompanyOption[];
  closeHref: string;
}) {
  const t = useTranslations("admin.venues");
  const fieldId = (field: VenueField) => `venue-${field}`;
  const options = companies.filter((c) => !c.deactivated || c.id === venue?.company?.id);

  return (
    <ListEditorForm<VenueState>
      action={action}
      emptyState={emptyVenueState}
      closeHref={closeHref}
      savedLabel={t("saved")}
      failedMessage={(key) => t(`errors.${key}`)}
      summaryTitle={t("errorSummaryTitle")}
      summary={(state) =>
        summaryErrors(state, { fields: VENUE_FIELDS, label: (f) => t(LABEL_KEY[f]), message: (key) => t(`errors.${key}`), fieldId })
      }
      submitLabel={t("save")}
      pendingLabel={t("saving")}
    >
      {(state) => {
        const attempted = hasAttempted(state) && !state.saved;
        // After a refused attempt, what was typed; otherwise the venue as stored (or nothing, for a new one).
        const value = (field: VenueField, stored: string) => (attempted ? was(state, field) : stored);
        const err = (field: VenueField) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
        const required = (field: VenueField) => VENUE_REQUIRED_FIELDS.includes(field);
        return (
          <>
            <Field id={fieldId("name")} label={t("nameLabel")} required={required("name")} error={err("name")}>
              <Input name="name" defaultValue={value("name", venue?.name ?? "")} maxLength={120} />
            </Field>
            <Field id={fieldId("companyId")} label={t("companyLabel")} error={err("companyId")}>
              <Select name="companyId" defaultValue={value("companyId", venue?.company?.id ?? NO_COMPANY)}>
                <option value={NO_COMPANY}>{t("noCompany")}</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.deactivated ? t("companyInactiveOption", { name: c.name }) : c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={fieldId("address")} label={t("addressLabel")} error={err("address")}>
              <Input name="address" defaultValue={value("address", venue?.address ?? "")} maxLength={300} />
            </Field>
            <Field id={fieldId("mapUrl")} label={t("mapLabel")} error={err("mapUrl")}>
              {/* A URL types left to right whatever the page direction. */}
              <Input name="mapUrl" type="url" dir="ltr" defaultValue={value("mapUrl", venue?.mapUrl ?? "")} />
            </Field>
            <Field id={fieldId("capacity")} label={t("capacityLabel")} error={err("capacity")}>
              <Input
                name="capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                dir="ltr"
                defaultValue={value("capacity", venue?.capacity != null ? String(venue.capacity) : "")}
                className="w-32 text-center"
              />
            </Field>
            <Field id={fieldId("timeZone")} label={t("timeZoneLabel")} hint={t("timeZoneHint")} error={err("timeZone")}>
              <Input name="timeZone" dir="ltr" placeholder="Asia/Riyadh" maxLength={64} defaultValue={value("timeZone", venue?.timeZone ?? "")} />
            </Field>
            <Field id={fieldId("notes")} label={t("notesLabel")} error={err("notes")}>
              <Textarea name="notes" rows={3} maxLength={2000} defaultValue={value("notes", venue?.notes ?? "")} className="min-h-24" />
            </Field>
          </>
        );
      }}
    </ListEditorForm>
  );
}
