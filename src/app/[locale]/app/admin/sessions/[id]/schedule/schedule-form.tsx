"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RtlDateTimePicker } from "@/components/admin/rtl-datetime-picker";
import { formatDateTime, formatNumber, formatTime, sameDay } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AlertCircleIcon } from "@/components/ui/icons";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { RadioGroup } from "@/components/ui/radio-group";
import { SectionHeader } from "@/components/ui/section-header";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { was } from "@/lib/form-state";
import {
  CUSTOM_VENUE,
  DEADLINE_PRESETS,
  atZone,
  checkRelations,
  deadlineFor,
  endFollows,
  followingEnd,
  missingForPublish,
  presetOf,
  type DeadlinePreset,
  type RelationField,
} from "./rules";
import { SCHEDULE_FIELDS, emptyScheduleState, type ScheduleField, type ScheduleState } from "./state";
import { usePickerValue } from "./use-picker-value";

// SCR-043's form — REQ-SES-001, REQ-SES-002, REQ-SES-016, REQ-PRO-009,
// DEC-117/118 (walk-ins), wave 8's lead row L2 (`DEC-147`).
//
// ★ «more user friendly … intuitive to fill and quick» (the owner), read as
// REQ-SES-016 states it for the one-day session every org schedules:
//
//   · NOTHING IS TYPED TWICE. The duration pre-fills from the proposal
//     (REQ-PRO-009); the end is COMPUTED and said as a sentence, and only an
//     explicit «عدّل وقت الانتهاء» turns it into a field — an end set by hand
//     wins and stops following (OQ-001); the capacity follows the chosen
//     venue until someone types one; both deadlines are presets relative to
//     the start, with «موعد آخر» for the rare exact time.
//   · THE RELATIONS ARE SAID AT THE FIELD, AT ONCE. An end before the start or
//     a deadline after it is shown the moment a picker commits or a preset
//     moves (REQ-SES-016) — before the database's constraint says it. A field
//     merely left EMPTY is not an error until a submit (REQ-UIX-011): nobody
//     is told they are wrong while they are still filling the form in.
//   · ONE PRESS TO PUBLISH. «انشر الجلسة» saves and publishes in one action,
//     disabled while REQ-SES-001's gate is unmet — naming what is missing, from
//     the form as it stands rather than from the last save.
//   · ONE SCROLL ON A PHONE, not SCR-043's four-step stepper: four more presses
//     on the form an admin fills most. The actions stay in reach in a sticky
//     bar above the tab bar (`--tabbar-h`) — sticky, never a second fixed bar.
//
// Values survive a failed round trip twice over: everything tracked here is
// controlled state, which React's form reset does not touch, and the rest reads
// its `defaultValue` back through `was()` (`lib/form-state.ts`).

export type ScheduleVenue = { id: string; name: string; address: string | null; capacity: number | null };

export interface ScheduleInitial {
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
  certificateMode: "off" | "automatic" | "review";
  language: "ar" | "en";
  /** `sessions.allow_walk_ins` — REQUIRED, and the stored value: an unticked
   *  default would switch walk-ins off on any save (DEC-118, DEC-141). */
  allowWalkIns: boolean;
}

const LABEL_KEY: Record<ScheduleField, string> = {
  startsAt: "startsAt.label",
  durationMinutes: "duration.label",
  endMode: "ends.label",
  endsAt: "ends.label",
  venueChoice: "venue.label",
  customVenueName: "venue.customName",
  customVenueAddress: "venue.customAddress",
  customVenueMapUrl: "venue.customMap",
  capacity: "capacity.label",
  allowWalkIns: "walkIns.label",
  rsvpPreset: "rsvpDeadline.legend",
  rsvpDeadlineAt: "rsvpDeadline.legend",
  cutoffPreset: "cutoff.legend",
  cancellationCutoffAt: "cutoff.legend",
  certificateMode: "certificate.legend",
  language: "language.legend",
};

const PICKER_KEYS = ["clear", "today", "done", "hour", "minute", "empty", "prevMonth", "nextMonth"] as const;

type Stamped<T> = { attempt: number; value: T };

export function ScheduleForm({
  action,
  venues,
  locale,
  timeZone,
  initial,
  proposalDurationMinutes,
  published,
}: {
  action: (prev: ScheduleState, formData: FormData) => Promise<ScheduleState>;
  venues: ScheduleVenue[];
  locale: string;
  timeZone: string;
  initial: ScheduleInitial;
  /** `proposals.expected_duration_minutes`, when the session came from one. */
  proposalDurationMinutes: number | null;
  /** Published or later: the primary action saves changes and warns who is told. */
  published: boolean;
}) {
  const t = useTranslations("schedule");
  const tp = useTranslations("admin.dateTime");
  const [state, formAction, pending] = useActionState(action, emptyScheduleState());
  const [pressed, setPressed] = useState<"publish" | "save">("save");

  // ── What the form is tracking ────────────────────────────────────────────
  const initialDuration = initial.durationMinutes || (proposalDurationMinutes ? String(proposalDurationMinutes) : "60");
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [duration, setDuration] = useState(initialDuration);
  const [endMode, setEndMode] = useState<"follow" | "explicit">(
    endFollows(initial.startsAt, initialDuration, initial.endsAt) ? "follow" : "explicit",
  );
  const [explicitEnd, setExplicitEnd] = useState(initial.endsAt);
  const [venueChoice, setVenueChoice] = useState(
    initial.customVenueName ? CUSTOM_VENUE : initial.venueId,
  );
  const venueOf = (id: string) => venues.find((v) => v.id === id) ?? null;
  const [capacity, setCapacity] = useState(initial.capacity);
  // The capacity follows the venue until someone types a different number.
  const [capacityOwn, setCapacityOwn] = useState(
    initial.capacity !== "" && initial.capacity !== String(venueOf(initial.venueId)?.capacity ?? ""),
  );
  const [walkIns, setWalkIns] = useState(initial.allowWalkIns);
  const [rsvpPreset, setRsvpPreset] = useState<DeadlinePreset>(presetOf(initial.rsvpDeadlineAt, initial.startsAt));
  const [rsvpCustom, setRsvpCustom] = useState(initial.rsvpDeadlineAt);
  const [cutoffPreset, setCutoffPreset] = useState<DeadlinePreset>(presetOf(initial.cancellationCutoffAt, initial.startsAt));
  const [cutoffCustom, setCutoffCustom] = useState(initial.cancellationCutoffAt);
  const [certificateMode, setCertificateMode] = useState<string>(initial.certificateMode);
  const [language, setLanguage] = useState<string>(initial.language);

  const endsAt = endMode === "explicit" ? explicitEnd : followingEnd(startsAt, duration);
  const rsvpDeadlineAt = deadlineFor(rsvpPreset, startsAt, rsvpCustom);
  const cancellationCutoffAt = deadlineFor(cutoffPreset, startsAt, cutoffCustom);

  // ── Errors: the relations at once, everything else after a submit ────────
  const [overlay, setOverlay] = useState<Stamped<Partial<Record<ScheduleField, string | null>>>>({ attempt: 0, value: {} });
  const fresh = overlay.attempt === state.attempt ? overlay.value : {};
  const recheck = (next: { startsAt?: string; endsAt?: string; rsvpDeadlineAt?: string; cancellationCutoffAt?: string }) => {
    const relations = checkRelations({
      startsAt: next.startsAt ?? startsAt,
      endsAt: next.endsAt ?? endsAt,
      rsvpDeadlineAt: next.rsvpDeadlineAt ?? rsvpDeadlineAt,
      cancellationCutoffAt: next.cancellationCutoffAt ?? cancellationCutoffAt,
    });
    const value: Partial<Record<ScheduleField, string | null>> = { ...fresh };
    for (const field of ["endsAt", "rsvpDeadlineAt", "cancellationCutoffAt"] as RelationField[]) value[field] = relations[field] ?? null;
    // A start that now exists clears «اختر تاريخ الجلسة ووقتها».
    if ((next.startsAt ?? startsAt) && state.errors.startsAt) value.startsAt = null;
    setOverlay({ attempt: state.attempt, value });
  };
  const shown = (field: ScheduleField): string | undefined => (field in fresh ? (fresh[field] ?? undefined) : state.errors[field]);
  const err = (field: ScheduleField) => {
    const key = shown(field);
    return key ? t(`errors.${key}`) : undefined;
  };

  // ── Pickers ──────────────────────────────────────────────────────────────
  const whenRef = useRef<HTMLDivElement>(null);
  const attendanceRef = useRef<HTMLDivElement>(null);
  usePickerValue(whenRef, "startsAt", (value) => {
    setStartsAt(value);
    recheck({
      startsAt: value,
      endsAt: endMode === "explicit" ? explicitEnd : followingEnd(value, duration),
      rsvpDeadlineAt: deadlineFor(rsvpPreset, value, rsvpCustom),
      cancellationCutoffAt: deadlineFor(cutoffPreset, value, cutoffCustom),
    });
  });
  usePickerValue(whenRef, "endsAt", (value) => {
    setExplicitEnd(value);
    recheck({ endsAt: value });
  }, endMode === "explicit");
  usePickerValue(attendanceRef, "rsvpDeadlineAt", (value) => {
    setRsvpCustom(value);
    recheck({ rsvpDeadlineAt: value });
  }, rsvpPreset === "custom");
  usePickerValue(attendanceRef, "cancellationCutoffAt", (value) => {
    setCutoffCustom(value);
    recheck({ cancellationCutoffAt: value });
  }, cutoffPreset === "custom");

  const pickerLabels = Object.fromEntries(PICKER_KEYS.map((k) => [`${k}Label`, tp(k)])) as Record<`${(typeof PICKER_KEYS)[number]}Label`, string>;
  const picker = (id: "startsAt" | "endsAt" | "rsvpDeadlineAt" | "cancellationCutoffAt", label: string, hint: string | undefined, defaultValue: string) => (
    <RtlDateTimePicker
      id={id}
      name={id}
      label={label}
      hint={hint}
      defaultValue={defaultValue}
      locale={locale}
      clearLabel={pickerLabels.clearLabel}
      todayLabel={pickerLabels.todayLabel}
      doneLabel={pickerLabels.doneLabel}
      hourLabel={pickerLabels.hourLabel}
      minuteLabel={pickerLabels.minuteLabel}
      emptyLabel={pickerLabels.emptyLabel}
      prevMonthLabel={pickerLabels.prevMonthLabel}
      nextMonthLabel={pickerLabels.nextMonthLabel}
    />
  );
  // The picker draws its own label, so it cannot sit inside <Field>; its error
  // is Field's markup, beside it, and — like Field's — not a live region: the
  // summary is the announcement (`ui/field.tsx`).
  const fieldError = (field: ScheduleField) => {
    const message = err(field);
    return message ? (
      <p id={`${field}-error`} className="mt-2 flex items-start gap-2 text-caption text-error">
        <AlertCircleIcon className="mt-[0.2em]" />
        <span>{message}</span>
      </p>
    ) : null;
  };

  /** A wall clock as the house sentence — the date only when it is not the start's day. */
  const spoken = (local: string, withDate: boolean) => {
    const iso = atZone(local, timeZone);
    if (!iso) return "";
    const startIso = atZone(startsAt, timeZone);
    return withDate || !startIso || !sameDay(iso, startIso, timeZone) ? formatDateTime(iso, timeZone, locale) : formatTime(iso, timeZone, locale);
  };

  // ── Publish ──────────────────────────────────────────────────────────────
  // The custom place's two required fields are uncontrolled; what they hold is
  // mirrored here only so the gate below reads the form as it stands.
  const [customFilled, setCustomFilled] = useState({
    name: was(state, "customVenueName") || initial.customVenueName,
    address: was(state, "customVenueAddress") || initial.customVenueAddress,
  });
  const missing = missingForPublish({
    startsAt,
    durationMinutes: duration,
    venueChoice,
    customVenueName: customFilled.name,
    customVenueAddress: customFilled.address,
    capacity,
    venueCapacity: venueChoice === CUSTOM_VENUE ? null : (venueOf(venueChoice)?.capacity ?? null),
  });

  // The errors SHOWN, in page order — DEC-144's rule for a form with blur
  // checks: the summary lists what is on the page, not the last submit.
  const summary = SCHEDULE_FIELDS.flatMap((field) => {
    const key = shown(field);
    return key ? [{ fieldId: field, label: t(LABEL_KEY[field]), message: t(`errors.${key}`) }] : [];
  });

  /** Each preset says the time it means, once there is a start to mean it from. */
  const presetOptions = () =>
    DEADLINE_PRESETS.map((preset) => ({
      value: preset,
      label: t(`preset.${preset}`),
      hint: preset !== "custom" && startsAt ? spoken(deadlineFor(preset, startsAt, ""), true) : undefined,
    }));

  return (
    <form action={formAction} noValidate className="space-y-10">
      {state.attempt > 0 && summary.length > 0 ? (
        <FormSummary key={state.attempt} errors={summary} title={t("summary.title", { count: summary.length, value: formatNumber(summary.length) })} description={t("summary.description")} />
      ) : null}
      {state.formError ? (
        <Panel tone="error">
          <p role="alert" className="text-body-sm text-fg-heading">
            {t(`errors.${state.formError}`)}
          </p>
        </Panel>
      ) : null}
      {state.published || state.saved ? (
        <Panel tone="success">
          <p role="status" className="text-body-sm text-fg-heading">
            {t(state.published ? "status.published" : "status.saved")}
          </p>
        </Panel>
      ) : null}

      {/* ── متى ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="schedule-when" className="space-y-6">
        <SectionHeader id="schedule-when" title={t("sections.when")} />
        <div ref={whenRef} className="space-y-6">
          <div>
            {picker("startsAt", t("startsAt.label"), t("startsAt.hint"), was(state, "startsAt") || initial.startsAt)}
            {fieldError("startsAt")}
          </div>

          <Field
            id="durationMinutes"
            label={t("duration.label")}
            hint={proposalDurationMinutes ? t("duration.fromProposal", { count: proposalDurationMinutes, value: formatNumber(proposalDurationMinutes) }) : t("duration.hint")}
            error={err("durationMinutes")}
          >
            <Input
              name="durationMinutes"
              inputMode="numeric"
              dir="ltr"
              value={duration}
              onChange={(e) => setDuration(e.currentTarget.value)}
              onBlur={() => recheck({ endsAt: endMode === "explicit" ? explicitEnd : followingEnd(startsAt, duration) })}
              className="w-32 text-center"
            />
          </Field>

          <input type="hidden" name="endMode" value={endMode} />
          {endMode === "follow" ? (
            <div>
              <p className="text-body text-fg-body" aria-live="polite">
                {endsAt ? t("ends.follows", { time: spoken(endsAt, false) }) : t("ends.followsEmpty")}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => {
                  setExplicitEnd(followingEnd(startsAt, duration));
                  setEndMode("explicit");
                }}
              >
                {t("ends.edit")}
              </Button>
            </div>
          ) : (
            <div>
              {picker("endsAt", t("ends.label"), t("ends.hint"), explicitEnd)}
              {fieldError("endsAt")}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => {
                  setEndMode("follow");
                  recheck({ endsAt: followingEnd(startsAt, duration) });
                }}
              >
                {t("ends.follow")}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ── أين ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="schedule-where" className="space-y-6">
        <SectionHeader id="schedule-where" title={t("sections.where")} />
        <Field id="venueChoice" label={t("venue.label")} error={err("venueChoice")}>
          <Select
            name="venueChoice"
            value={venueChoice}
            onChange={(e) => {
              const next = e.currentTarget.value;
              setVenueChoice(next);
              if (!capacityOwn) setCapacity(next === CUSTOM_VENUE ? "" : String(venueOf(next)?.capacity ?? ""));
            }}
          >
            <option value="">{t("venue.placeholder")}</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {t("venue.option", { name: v.name, count: v.capacity ?? 0, value: formatNumber(v.capacity ?? 0) })}
              </option>
            ))}
            <option value={CUSTOM_VENUE}>{t("venue.other")}</option>
          </Select>
        </Field>

        {venueChoice === CUSTOM_VENUE ? (
          <div className="space-y-5 border-s-2 border-edge ps-4">
            <p className="text-body-sm text-fg-muted">{t("venue.customHint")}</p>
            <Field id="customVenueName" label={t("venue.customName")} required error={err("customVenueName")}>
              <Input
                name="customVenueName"
                maxLength={120}
                defaultValue={was(state, "customVenueName") || initial.customVenueName}
                onChange={(e) => setCustomFilled((c) => ({ ...c, name: e.currentTarget.value }))}
              />
            </Field>
            <Field id="customVenueAddress" label={t("venue.customAddress")} required error={err("customVenueAddress")}>
              <Input
                name="customVenueAddress"
                maxLength={300}
                defaultValue={was(state, "customVenueAddress") || initial.customVenueAddress}
                onChange={(e) => setCustomFilled((c) => ({ ...c, address: e.currentTarget.value }))}
              />
            </Field>
            <Field id="customVenueMapUrl" label={t("venue.customMap")} hint={t("venue.customMapHint")} error={err("customVenueMapUrl")}>
              <Input name="customVenueMapUrl" type="url" dir="ltr" defaultValue={was(state, "customVenueMapUrl") || initial.customVenueMapUrl} />
            </Field>
          </div>
        ) : null}

        <Field
          id="capacity"
          label={t("capacity.label")}
          hint={!capacityOwn && venueOf(venueChoice)?.capacity ? t("capacity.fromVenue", { count: venueOf(venueChoice)!.capacity!, value: formatNumber(venueOf(venueChoice)!.capacity!) }) : t("capacity.hint")}
          error={err("capacity")}
        >
          <Input
            name="capacity"
            inputMode="numeric"
            dir="ltr"
            value={capacity}
            onChange={(e) => {
              setCapacity(e.currentTarget.value);
              setCapacityOwn(e.currentTarget.value !== "" && e.currentTarget.value !== String(venueOf(venueChoice)?.capacity ?? ""));
            }}
            className="w-32 text-center"
          />
        </Field>
      </section>

      {/* ── الحضور ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="schedule-attendance" className="space-y-6">
        <SectionHeader id="schedule-attendance" title={t("sections.attendance")} />
        <div ref={attendanceRef} className="space-y-6">
          <div>
            <RadioGroup
              name="rsvpPreset"
              legend={t("rsvpDeadline.legend")}
              options={presetOptions()}
              value={rsvpPreset}
              onChange={(value) => {
                const preset = value as DeadlinePreset;
                if (preset === "custom" && !rsvpCustom) setRsvpCustom(rsvpDeadlineAt);
                setRsvpPreset(preset);
                recheck({ rsvpDeadlineAt: deadlineFor(preset, startsAt, rsvpCustom || rsvpDeadlineAt) });
              }}
            />
            {rsvpPreset === "custom" ? <div className="mt-3 ps-10">{picker("rsvpDeadlineAt", t("preset.customLabel"), undefined, rsvpCustom)}</div> : null}
            {fieldError("rsvpDeadlineAt")}
          </div>

          <div>
            <RadioGroup
              name="cutoffPreset"
              legend={t("cutoff.legend")}
              options={presetOptions()}
              value={cutoffPreset}
              onChange={(value) => {
                const preset = value as DeadlinePreset;
                if (preset === "custom" && !cutoffCustom) setCutoffCustom(cancellationCutoffAt);
                setCutoffPreset(preset);
                recheck({ cancellationCutoffAt: deadlineFor(preset, startsAt, cutoffCustom || cancellationCutoffAt) });
              }}
            />
            {cutoffPreset === "custom" ? <div className="mt-3 ps-10">{picker("cancellationCutoffAt", t("preset.customLabel"), undefined, cutoffCustom)}</div> : null}
            {fieldError("cancellationCutoffAt")}
          </div>

          <Switch name="allowWalkIns" checked={walkIns} onCheckedChange={setWalkIns} label={t("walkIns.label")} description={t("walkIns.hint")} />
        </div>
      </section>

      {/* ── الشهادة واللغة ──────────────────────────────────────────────── */}
      <section aria-labelledby="schedule-certificate" className="space-y-6">
        <SectionHeader id="schedule-certificate" title={t("sections.certificate")} />
        <RadioGroup
          name="certificateMode"
          legend={t("certificate.legend")}
          value={certificateMode}
          onChange={setCertificateMode}
          options={[
            { value: "off", label: t("certificate.off") },
            { value: "automatic", label: t("certificate.automatic") },
            { value: "review", label: t("certificate.review"), hint: t("certificate.reviewHint") },
          ]}
        />
        <div>
          <RadioGroup
            name="language"
            legend={t("language.legend")}
            value={language}
            onChange={setLanguage}
            options={[
              { value: "ar", label: t("language.ar") },
              { value: "en", label: t("language.en") },
            ]}
          />
          <p className="mt-1 text-caption text-fg-muted">{t("language.hint")}</p>
        </div>
      </section>

      {/* ── The actions, in reach ───────────────────────────────────────── */}
      <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))] z-20 -mx-4 border-t border-edge bg-canvas px-4 py-4 md:static md:mx-0 md:border-0 md:px-0">
        {!published && missing.length > 0 ? (
          <div className="mb-3">
            <p className="text-label text-fg-heading">{t("missing.title")}</p>
            <p className="mt-1 text-body-sm text-fg-body">{missing.map((m) => t(`missing.${m}`)).join(" · ")}</p>
          </div>
        ) : (
          <p className="mb-3 text-body-sm text-fg-muted">{t(published ? "actions.editedNote" : "actions.publishNote")}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {published ? (
            <Button type="submit" name="intent" value="save" pending={pending} pendingLabel={t("actions.pending")}>
              {t("actions.saveChanges")}
            </Button>
          ) : (
            <>
              <Button
                type="submit"
                name="intent"
                value="publish"
                disabled={missing.length > 0 || (pending && pressed !== "publish")}
                pending={pending && pressed === "publish"}
                pendingLabel={t("actions.pending")}
                onClick={() => setPressed("publish")}
              >
                {t("actions.publish")}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="save"
                variant="secondary"
                disabled={pending && pressed !== "save"}
                pending={pending && pressed === "save"}
                pendingLabel={t("actions.pending")}
                onClick={() => setPressed("save")}
              >
                {t("actions.saveOnly")}
              </Button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
