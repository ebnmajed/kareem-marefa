"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { RtlDateTimePicker } from "@/components/admin/rtl-datetime-picker";
import { Button } from "@/components/ui/button";
import type { ScheduleState } from "./actions";
import { emptyScheduleState } from "./state";

// SCR-043's form (REQ-SES-001, REQ-SES-002).
//
// The four date-time fields (`startsAt`, `endsAt`, `rsvpDeadlineAt`,
// `cancellationCutoffAt`) use `<RtlDateTimePicker>` (`src/components/
// admin/rtl-datetime-picker.tsx`) — DEC-045's carried-over item, closed at
// wave 3 (console.md): a native `datetime-local` renders its calendar and
// placeholder in the BROWSER's own locale, unreachable from this page's
// own `dir="rtl"`. Every other field keeps its plain `dir="ltr"` box.
//
// Fields read their defaultValue out of the returned state as well as the
// row, because React 19 resets a form once its action resolves — see
// docs/plan/notes/sessions.md §5.

export type ScheduleVenue = { id: string; name: string; address: string | null; capacity: number | null };

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";

export function ScheduleForm({
  action,
  venues,
  locale,
  initial,
}: {
  action: (prev: ScheduleState, formData: FormData) => Promise<ScheduleState>;
  venues: ScheduleVenue[];
  locale: string;
  initial: {
    startsAt: string;
    durationMinutes: string;
    endsAt: string;
    venueId: string;
    customVenueName: string;
    customVenueAddress: string;
    customVenueMapUrl: string;
    capacity: string;
    rsvpDeadlineAt: string;
    cancellationCutoffAt: string;
    certificateMode: string;
    language: string;
    /** `sessions.allow_walk_ins` (DEC-117, DEC-118, contract 1) — `checkin`'s
     *  one feature-only field on this form, ★ transferred by DEC-137.
     *  Required: `page.tsx` reads it back as of `343991d`, so a page that
     *  forgot to pass it is a build failure here, not a silent unchecked
     *  box that writes `false` over a session's real setting on save (the
     *  hazard `sessions` found and this type now makes impossible). */
    allowWalkIns: boolean;
  };
}) {
  const t = useTranslations("admin.schedule");
  // ★ `checkin`'s own namespace, for its one field only — DEC-137's "a
  // screen's strings move with the screen" moved the attendance/host-view
  // strings to checkin.json; admin.json isn't in `checkin`'s edit list this
  // wave, so this is the only file the walk-in field's copy can live in.
  const tc = useTranslations("checkin.schedule");
  const [state, formAction, pending] = useActionState(action, emptyScheduleState);
  const [custom, setCustom] = useState(initial.customVenueName !== "");

  return (
    <form action={formAction} className="mt-8 max-w-2xl space-y-7">
      {state.error ? (
        <p role="alert" className="rounded-field border border-edge-strong p-4 text-body-sm text-fg-heading">
          {t(state.error)}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-field border border-edge bg-silver-100 p-4 text-body-sm text-fg-heading">
          {t("saved")}
        </p>
      ) : null}

      <RtlDateTimePicker
        id="startsAt"
        name="startsAt"
        label={t("whenLabel")}
        hint={t("whenHint")}
        required
        defaultValue={initial.startsAt}
        locale={locale}
        clearLabel={t("pickerClear")}
        todayLabel={t("pickerToday")}
        doneLabel={t("pickerDone")}
        hourLabel={t("pickerHour")}
        minuteLabel={t("pickerMinute")}
        emptyLabel={t("pickerEmpty")}
        prevMonthLabel={t("pickerPrevMonth")}
        nextMonthLabel={t("pickerNextMonth")}
      />

      <div>
        <label htmlFor="durationMinutes" className="text-label text-fg-heading">
          {t("durationLabel")}
        </label>
        <p className="mt-1 text-body-sm text-fg-muted">{t("durationHint")}</p>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            inputMode="numeric"
            required
            min={15}
            max={480}
            step={5}
            dir="ltr"
            defaultValue={initial.durationMinutes || "60"}
            className={`${FIELD} mt-0 w-32 text-center`}
          />
          <span className="text-body text-fg-muted">{t("durationUnit")}</span>
        </div>
      </div>

      <RtlDateTimePicker
        id="endsAt"
        name="endsAt"
        label={t("endsLabel")}
        hint={t("endsHint")}
        defaultValue={initial.endsAt}
        locale={locale}
        clearLabel={t("pickerClear")}
        todayLabel={t("pickerToday")}
        doneLabel={t("pickerDone")}
        hourLabel={t("pickerHour")}
        minuteLabel={t("pickerMinute")}
        emptyLabel={t("pickerEmpty")}
        prevMonthLabel={t("pickerPrevMonth")}
        nextMonthLabel={t("pickerNextMonth")}
      />

      <fieldset>
        <legend className="text-label text-fg-heading">{t("venueLabel")}</legend>
        <select
          aria-label={t("venueLabel")}
          name="venueId"
          defaultValue={initial.venueId}
          disabled={custom}
          className={FIELD}
        >
          <option value="">{t("venuePlaceholder")}</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-body text-fg-body">
          <input type="checkbox" name="venueKind" value="custom" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="size-5" />
          {t("venueCustom")}
        </label>
        {custom ? (
          <div className="mt-2 space-y-4 border-s-2 border-edge ps-4">
            <p className="text-body-sm text-fg-muted">{t("customHint")}</p>
            <div>
              <label htmlFor="customVenueName" className="text-label text-fg-heading">
                {t("customNameLabel")}
              </label>
              <input id="customVenueName" name="customVenueName" required maxLength={120} defaultValue={initial.customVenueName} className={FIELD} />
            </div>
            <div>
              <label htmlFor="customVenueAddress" className="text-label text-fg-heading">
                {t("customAddressLabel")}
              </label>
              <input id="customVenueAddress" name="customVenueAddress" required maxLength={300} defaultValue={initial.customVenueAddress} className={FIELD} />
            </div>
            <div>
              <label htmlFor="customVenueMapUrl" className="text-label text-fg-heading">
                {t("customMapLabel")}
              </label>
              <input id="customVenueMapUrl" name="customVenueMapUrl" type="url" dir="ltr" defaultValue={initial.customVenueMapUrl} className={FIELD} />
            </div>
          </div>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="capacity" className="text-label text-fg-heading">
          {t("capacityLabel")}
        </label>
        <p className="mt-1 text-body-sm text-fg-muted">{t("capacityHint")}</p>
        <input id="capacity" name="capacity" type="number" inputMode="numeric" min={1} max={10000} dir="ltr" defaultValue={initial.capacity} className={`${FIELD} w-32 text-center`} />
      </div>

      {/* DEC-117/DEC-118: a publishing-time setting, changed only through
          this same form — no in-room toggle exists anymore. An unchecked
          checkbox sends no key at all, so the action reads presence, never
          treating "absent" as "unchanged" (this form always states an
          explicit value, unlike a reschedule call that skips the field) —
          safe now that `initial.allowWalkIns` is required and always the
          session's real value (the interim `allowWalkInsKnown` marker this
          comment used to describe is gone as of `page.tsx`'s own read-back
          at `343991d`). */}
      <div>
        <label className="flex min-h-11 items-center gap-3 text-body text-fg-body">
          <input type="checkbox" name="allowWalkIns" defaultChecked={initial.allowWalkIns} className="size-5" />
          {tc("allowWalkIns.label")}
        </label>
        <p className="mt-1 text-body-sm text-fg-muted">{tc("allowWalkIns.hint")}</p>
      </div>

      <RtlDateTimePicker
        id="rsvpDeadlineAt"
        name="rsvpDeadlineAt"
        label={t("rsvpDeadlineLabel")}
        hint={t("deadlineHint")}
        defaultValue={initial.rsvpDeadlineAt}
        locale={locale}
        clearLabel={t("pickerClear")}
        todayLabel={t("pickerToday")}
        doneLabel={t("pickerDone")}
        hourLabel={t("pickerHour")}
        minuteLabel={t("pickerMinute")}
        emptyLabel={t("pickerEmpty")}
        prevMonthLabel={t("pickerPrevMonth")}
        nextMonthLabel={t("pickerNextMonth")}
      />

      <RtlDateTimePicker
        id="cancellationCutoffAt"
        name="cancellationCutoffAt"
        label={t("cutoffLabel")}
        defaultValue={initial.cancellationCutoffAt}
        locale={locale}
        clearLabel={t("pickerClear")}
        todayLabel={t("pickerToday")}
        doneLabel={t("pickerDone")}
        hourLabel={t("pickerHour")}
        minuteLabel={t("pickerMinute")}
        emptyLabel={t("pickerEmpty")}
        prevMonthLabel={t("pickerPrevMonth")}
        nextMonthLabel={t("pickerNextMonth")}
      />

      <div>
        <label htmlFor="certificateMode" className="text-label text-fg-heading">
          {t("certificateLabel")}
        </label>
        <select id="certificateMode" name="certificateMode" defaultValue={initial.certificateMode} className={FIELD}>
          <option value="off">{t("certificateOff")}</option>
          <option value="automatic">{t("certificateAutomatic")}</option>
          <option value="review">{t("certificateReview")}</option>
        </select>
      </div>

      <div>
        {/* REQ-SES-011: the language of the room, not of the interface. */}
        <label htmlFor="language" className="text-label text-fg-heading">
          {t("languageLabel")}
        </label>
        <p className="mt-1 text-body-sm text-fg-muted">{t("languageHint")}</p>
        <select id="language" name="language" defaultValue={initial.language} className={FIELD}>
          <option value="ar">{t("languageAr")}</option>
          <option value="en">{t("languageEn")}</option>
        </select>
      </div>

      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
