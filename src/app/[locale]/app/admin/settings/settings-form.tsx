"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import type { OrgSettingsAdmin } from "@/lib/dal/admin-settings";
import { emptySettingsState, SETTINGS_FIELDS, SETTINGS_REQUIRED_FIELDS, type SettingsField, type SettingsState } from "./state";

// SCR-063's form, onto `lib/form-state`'s shared model for wave 7
// (`16` §8.2, `DEC-137`) — the one substantive rebuild among K3-K6: fourteen
// fields across six groups, all plain `<input>`/`<select>`/checkbox before
// this wave, zero `ui/` imports beyond `Button`.
//
// ★ THIS IS AN EDIT-IN-PLACE FORM, not a blank create form like `admin/
// sessions/direct-session-form.tsx` — `was()` alone is the wrong default:
// on the FIRST render nothing has failed yet, so `was()` would show every
// field EMPTY rather than the organisation's actual settings. `fieldValue()`
// below picks `was()` only once the member has actually submitted and been
// refused (preserving what they typed, `form-state.ts`'s whole point);
// before that, it shows the real value from `settings` — the prop this
// form was actually given.
const LABEL_KEY: Record<SettingsField, string> = {
  timeZone: "timeZoneLabel",
  checkInRotationSeconds: "checkInRotationLabel",
  checkInGraceSeconds: "checkInGraceLabel",
  maxCoPresenters: "maxCoPresentersLabel",
  companyMetric: "companyMetricLabel",
  priorityRsvpHours: "priorityRsvpHoursLabel",
  limitDocumentMb: "limitDocumentLabel",
  limitAudioMb: "limitAudioLabel",
  limitImageMb: "limitImageLabel",
  limitPosterMb: "limitPosterLabel",
  allowJpegExport: "allowJpegExportLabel",
  emailFromName: "emailFromNameLabel",
  emailReplyTo: "emailReplyToLabel",
  ratingMinAggregate: "ratingMinAggregateLabel",
};

const FIELD_ID: Record<SettingsField, string> = {
  timeZone: "s-timezone",
  checkInRotationSeconds: "s-checkin-rotation",
  checkInGraceSeconds: "s-checkin-grace",
  maxCoPresenters: "s-max-copresenters",
  companyMetric: "s-company-metric",
  priorityRsvpHours: "s-priority-rsvp",
  limitDocumentMb: "s-limit-document",
  limitAudioMb: "s-limit-audio",
  limitImageMb: "s-limit-image",
  limitPosterMb: "s-limit-poster",
  allowJpegExport: "s-allow-jpeg",
  emailFromName: "s-email-from-name",
  emailReplyTo: "s-email-reply-to",
  ratingMinAggregate: "s-rating-min",
};

export function SettingsForm({ action, settings }: { action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>; settings: OrgSettingsAdmin }) {
  const t = useTranslations("admin.settings");
  const [state, formAction, pending] = useActionState(action, emptySettingsState);
  const attempted = hasAttempted(state);
  const err = (field: SettingsField) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const required = (field: SettingsField) => SETTINGS_REQUIRED_FIELDS.includes(field);
  const value = (field: SettingsField, fallback: string) => (attempted ? was(state, field) : fallback);

  const summary = summaryErrors(state, {
    fields: SETTINGS_FIELDS,
    label: (field) => t(LABEL_KEY[field]),
    message: (key) => t(`errors.${key}`),
    // ★ The summary's links target the CONTROL's id, which is the `<Field id>`
    // below — not the field's name. Without this map every link pointed at an
    // element that does not exist and focused nothing (wave 8, F4; REQ-UIX-009).
    fieldId: (field) => FIELD_ID[field],
  });

  return (
    <form action={formAction} noValidate className="mt-6 max-w-2xl space-y-10">
      {attempted ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}
      {state.formError ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(`errors.${state.formError}`)}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="s-timezone" label={t("timeZoneLabel")} required={required("timeZone")} error={err("timeZone")}>
          <Input name="timeZone" dir="ltr" maxLength={64} defaultValue={value("timeZone", settings.timeZone)} />
        </Field>
      </div>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("checkinTitle")}</legend>
        <div className="mt-4 flex flex-wrap gap-6">
          <Field id="s-checkin-rotation" label={t("checkInRotationLabel")} required error={err("checkInRotationSeconds")}>
            <Input
              name="checkInRotationSeconds"
              type="number"
              inputMode="numeric"
              min={60}
              max={3600}
              dir="ltr"
              defaultValue={value("checkInRotationSeconds", String(settings.checkInRotationSeconds))}
              className="w-32 text-center"
            />
          </Field>
          <Field id="s-checkin-grace" label={t("checkInGraceLabel")} required error={err("checkInGraceSeconds")}>
            <Input
              name="checkInGraceSeconds"
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              dir="ltr"
              defaultValue={value("checkInGraceSeconds", String(settings.checkInGraceSeconds))}
              className="w-32 text-center"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("proposalsTitle")}</legend>
        <div className="mt-4 flex flex-wrap gap-6">
          <Field id="s-max-copresenters" label={t("maxCoPresentersLabel")} required error={err("maxCoPresenters")}>
            <Input
              name="maxCoPresenters"
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              dir="ltr"
              defaultValue={value("maxCoPresenters", String(settings.maxCoPresenters))}
              className="w-32 text-center"
            />
          </Field>
          <Field id="s-priority-rsvp" label={t("priorityRsvpHoursLabel")} hint={t("priorityRsvpHint")} required error={err("priorityRsvpHours")}>
            <Input
              name="priorityRsvpHours"
              type="number"
              inputMode="numeric"
              min={0}
              max={168}
              dir="ltr"
              defaultValue={value("priorityRsvpHours", String(settings.priorityRsvpHours))}
              className="w-32 text-center"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("recognitionTitle")}</legend>
        <Field id="s-company-metric" label={t("companyMetricLabel")} required error={err("companyMetric")} className="mt-4">
          <Select name="companyMetric" defaultValue={value("companyMetric", settings.companyMetric)}>
            <option value="total_points">{t("companyMetricTotal")}</option>
            <option value="points_per_active_member">{t("companyMetricPerActive")}</option>
          </Select>
        </Field>
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("uploadsTitle")}</legend>
        <div className="mt-4 flex flex-wrap gap-6">
          <Field id="s-limit-document" label={t("limitDocumentLabel")} required error={err("limitDocumentMb")}>
            <Input name="limitDocumentMb" type="number" inputMode="numeric" min={1} max={500} dir="ltr" defaultValue={value("limitDocumentMb", String(settings.limitDocumentMb))} className="w-32 text-center" />
          </Field>
          <Field id="s-limit-audio" label={t("limitAudioLabel")} required error={err("limitAudioMb")}>
            <Input name="limitAudioMb" type="number" inputMode="numeric" min={1} max={2000} dir="ltr" defaultValue={value("limitAudioMb", String(settings.limitAudioMb))} className="w-32 text-center" />
          </Field>
          <Field id="s-limit-image" label={t("limitImageLabel")} required error={err("limitImageMb")}>
            <Input name="limitImageMb" type="number" inputMode="numeric" min={1} max={100} dir="ltr" defaultValue={value("limitImageMb", String(settings.limitImageMb))} className="w-32 text-center" />
          </Field>
          <Field id="s-limit-poster" label={t("limitPosterLabel")} required error={err("limitPosterMb")}>
            <Input name="limitPosterMb" type="number" inputMode="numeric" min={1} max={200} dir="ltr" defaultValue={value("limitPosterMb", String(settings.limitPosterMb))} className="w-32 text-center" />
          </Field>
        </div>
        <Switch
          name="allowJpegExport"
          label={t("allowJpegExportLabel")}
          defaultChecked={attempted ? was(state, "allowJpegExport") === "on" : settings.allowJpegExport}
          className="mt-4"
        />
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("ratingsTitle")}</legend>
        <Field id="s-rating-min" label={t("ratingMinAggregateLabel")} required error={err("ratingMinAggregate")} className="mt-4">
          <Input
            name="ratingMinAggregate"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            dir="ltr"
            defaultValue={value("ratingMinAggregate", String(settings.ratingMinAggregate))}
            className="w-32 text-center"
          />
        </Field>
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("emailTitle")}</legend>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="s-email-from-name" label={t("emailFromNameLabel")} error={err("emailFromName")}>
            <Input name="emailFromName" maxLength={120} defaultValue={value("emailFromName", settings.emailFromName ?? "")} />
          </Field>
          <Field id="s-email-reply-to" label={t("emailReplyToLabel")} error={err("emailReplyTo")}>
            <Input name="emailReplyTo" type="email" dir="ltr" defaultValue={value("emailReplyTo", settings.emailReplyTo ?? "")} />
          </Field>
        </div>
      </fieldset>

      <Button type="submit" pending={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
