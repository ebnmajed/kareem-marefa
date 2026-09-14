"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { OrgSettingsAdmin } from "@/lib/dal/admin-settings";
import type { SettingsState } from "./actions";
import { emptySettingsState } from "./state";

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";
const NUM_FIELD = `${FIELD} w-32 text-center`;

export function SettingsForm({ action, settings }: { action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>; settings: OrgSettingsAdmin }) {
  const t = useTranslations("admin.settings");
  const [state, formAction, pending] = useActionState(action, emptySettingsState);

  return (
    <form action={formAction} className="mt-6 max-w-2xl space-y-10">
      {state.error ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(state.error)}
        </p>
      ) : state.saved ? (
        <p role="status" className="rounded-field border border-edge bg-silver-100 p-3 text-body-sm text-fg-body">
          {t("saved")}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="text-label text-fg-heading">
          {t("timeZoneLabel")}
          <input name="timeZone" defaultValue={settings.timeZone} dir="ltr" maxLength={64} className={FIELD} />
        </label>
        <label className="text-label text-fg-heading">
          {t("numeralsLabel")}
          <select name="numerals" defaultValue={settings.numerals} className={FIELD}>
            <option value="western">{t("numeralsWestern")}</option>
            <option value="arabic_indic">{t("numeralsArabicIndic")}</option>
          </select>
        </label>
      </div>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("checkinTitle")}</legend>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="text-label text-fg-heading">
            {t("checkInRotationLabel")}
            <input name="checkInRotationSeconds" type="number" inputMode="numeric" min={60} max={3600} dir="ltr" defaultValue={settings.checkInRotationSeconds} className={NUM_FIELD} />
          </label>
          <label className="text-label text-fg-heading">
            {t("checkInGraceLabel")}
            <input name="checkInGraceSeconds" type="number" inputMode="numeric" min={0} max={600} dir="ltr" defaultValue={settings.checkInGraceSeconds} className={NUM_FIELD} />
          </label>
        </div>
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("proposalsTitle")}</legend>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="text-label text-fg-heading">
            {t("maxCoPresentersLabel")}
            <input name="maxCoPresenters" type="number" inputMode="numeric" min={0} max={10} dir="ltr" defaultValue={settings.maxCoPresenters} className={NUM_FIELD} />
          </label>
          <label className="text-label text-fg-heading">
            {t("priorityRsvpHoursLabel")}
            <input name="priorityRsvpHours" type="number" inputMode="numeric" min={0} max={168} dir="ltr" defaultValue={settings.priorityRsvpHours} className={NUM_FIELD} />
          </label>
        </div>
        <p className="mt-2 text-body-sm text-fg-muted">{t("priorityRsvpHint")}</p>
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("recognitionTitle")}</legend>
        <label className="mt-4 block text-label text-fg-heading">
          {t("companyMetricLabel")}
          <select name="companyMetric" defaultValue={settings.companyMetric} className={FIELD}>
            <option value="total_points">{t("companyMetricTotal")}</option>
            <option value="points_per_active_member">{t("companyMetricPerActive")}</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("uploadsTitle")}</legend>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="text-label text-fg-heading">
            {t("limitDocumentLabel")}
            <input name="limitDocumentMb" type="number" inputMode="numeric" min={1} max={500} dir="ltr" defaultValue={settings.limitDocumentMb} className={NUM_FIELD} />
          </label>
          <label className="text-label text-fg-heading">
            {t("limitAudioLabel")}
            <input name="limitAudioMb" type="number" inputMode="numeric" min={1} max={2000} dir="ltr" defaultValue={settings.limitAudioMb} className={NUM_FIELD} />
          </label>
          <label className="text-label text-fg-heading">
            {t("limitImageLabel")}
            <input name="limitImageMb" type="number" inputMode="numeric" min={1} max={100} dir="ltr" defaultValue={settings.limitImageMb} className={NUM_FIELD} />
          </label>
          <label className="text-label text-fg-heading">
            {t("limitPosterLabel")}
            <input name="limitPosterMb" type="number" inputMode="numeric" min={1} max={200} dir="ltr" defaultValue={settings.limitPosterMb} className={NUM_FIELD} />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-label text-fg-heading">
          <input type="checkbox" name="allowJpegExport" defaultChecked={settings.allowJpegExport} className="h-5 w-5" />
          {t("allowJpegExportLabel")}
        </label>
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("ratingsTitle")}</legend>
        <label className="mt-4 block text-label text-fg-heading">
          {t("ratingMinAggregateLabel")}
          <input name="ratingMinAggregate" type="number" inputMode="numeric" min={1} max={20} dir="ltr" defaultValue={settings.ratingMinAggregate} className={NUM_FIELD} />
        </label>
      </fieldset>

      <fieldset className="border-t border-edge pt-6">
        <legend className="text-h3 text-fg-heading">{t("emailTitle")}</legend>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="text-label text-fg-heading">
            {t("emailFromNameLabel")}
            <input name="emailFromName" defaultValue={settings.emailFromName ?? ""} maxLength={120} className={FIELD} />
          </label>
          <label className="text-label text-fg-heading">
            {t("emailReplyToLabel")}
            <input name="emailReplyTo" type="email" dir="ltr" defaultValue={settings.emailReplyTo ?? ""} className={FIELD} />
          </label>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
