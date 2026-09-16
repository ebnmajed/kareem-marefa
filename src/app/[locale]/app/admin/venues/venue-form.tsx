"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import { emptyVenueState, VENUE_FIELDS, VENUE_REQUIRED_FIELDS, type VenueField, type VenueState } from "./state";

// SCR-046's add form, onto `lib/form-state`'s shared model for wave 7
// (`16` §8.2, `DEC-137`) — `admin/sessions/direct-session-form.tsx`'s
// pattern, the model every rebuilt admin form since wave 6 follows.

const LABEL_KEY: Record<VenueField, string> = {
  name: "nameLabel",
  address: "addressLabel",
  mapUrl: "mapLabelShort",
  capacity: "capacityLabel",
  notes: "notesLabel",
  timeZone: "timeZoneLabel",
};

const FIELD_ID: Record<VenueField, string> = {
  name: "v-name",
  address: "v-address",
  mapUrl: "v-map",
  capacity: "v-capacity",
  notes: "v-notes",
  timeZone: "v-tz",
};

export function VenueForm({ action }: { action: (prev: VenueState, formData: FormData) => Promise<VenueState> }) {
  const t = useTranslations("admin.venues");
  const [state, formAction, pending] = useActionState(action, emptyVenueState);
  const err = (field: VenueField) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const required = (field: VenueField) => VENUE_REQUIRED_FIELDS.includes(field);

  const summary = summaryErrors(state, {
    fields: VENUE_FIELDS,
    label: (field) => t(LABEL_KEY[field]),
    message: (key) => t(`errors.${key}`),
    // ★ The summary's links target the CONTROL's id, which is the `<Field id>`
    // below — not the field's name. Without this map every link pointed at an
    // element that does not exist and focused nothing (wave 8, F4; REQ-UIX-009).
    fieldId: (field) => FIELD_ID[field],
  });

  return (
    <form action={formAction} noValidate className="mt-4 max-w-2xl space-y-5">
      {hasAttempted(state) ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}
      {state.formError ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(`errors.${state.formError}`)}
        </p>
      ) : null}

      <Field id="v-name" label={t("nameLabel")} required={required("name")} error={err("name")}>
        <Input name="name" defaultValue={was(state, "name")} maxLength={120} />
      </Field>

      <Field id="v-address" label={t("addressLabel")} error={err("address")}>
        <Input name="address" defaultValue={was(state, "address")} maxLength={300} />
      </Field>

      <Field id="v-map" label={t("mapLabel")} error={err("mapUrl")}>
        {/* A URL types left to right whatever the page direction. */}
        <Input name="mapUrl" type="url" dir="ltr" defaultValue={was(state, "mapUrl")} />
      </Field>

      <Field id="v-capacity" label={t("capacityLabel")} error={err("capacity")}>
        <Input name="capacity" type="number" inputMode="numeric" min={1} max={10000} dir="ltr" defaultValue={was(state, "capacity")} className="w-32 text-center" />
      </Field>

      <Field id="v-tz" label={t("timeZoneLabel")} hint={t("timeZoneHint")} error={err("timeZone")}>
        <Input name="timeZone" dir="ltr" placeholder="Asia/Riyadh" maxLength={64} defaultValue={was(state, "timeZone")} />
      </Field>

      <Field id="v-notes" label={t("notesLabel")} error={err("notes")}>
        <Textarea name="notes" rows={3} maxLength={2000} defaultValue={was(state, "notes")} className="min-h-24" />
      </Field>

      <Button type="submit" pending={pending}>
        {t("add")}
      </Button>
    </form>
  );
}
