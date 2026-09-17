"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { dayLabel, dayShortLabel } from "@/components/sessions/day-label";
import { formatDateTime, formatNumber, formatTime, sameDay } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { DateTime } from "@/components/ui/date-time";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
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
  checkDays,
  checkRelations,
  dateOf,
  dayEnd,
  deadlineFor,
  endFollows,
  followingEnd,
  missingForPublish,
  nextDayAfter,
  presetOf,
  withSameClock,
  type DayDraft,
  type DeadlinePreset,
  type RelationField,
} from "./rules";
import { SCHEDULE_FIELDS, dayFieldId, emptyScheduleState, type DayField, type ScheduleField, type ScheduleState } from "./state";

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
//   · EVERY DATE IS `ui/date-time` INSIDE `<Field>` — one visible label, the
//     field's error and hint wired to the trigger, and each trigger named by its
//     own field («آخر موعد للحجز: …»), never a generic «التاريخ والوقت» four
//     times (`console`'s `18672c8`, requested at sync 1).
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
  /**
   * ★ The session's stored days, in order (`REQ-SES-015`, wave 9).
   *
   * Day one's WINDOW and PLACE are the fields above — the day list does not
   * render them twice — but its `id` is needed here, or a save would delete and
   * re-create the day every attendance record and every day-scoped file hangs
   * off. An unscheduled session has none; a scheduled one-day session has one.
   *
   * OPTIONAL, and that is deliberate rather than lax: an absent value honestly
   * means «one day, as the fields above describe it», which is the safe
   * reading. `allowWalkIns` stays REQUIRED because there an absent value would
   * have meant «off», and switching walk-ins off by omission was the hazard.
   */
  days?: SavedDay[];
  /** `sessions.require_all_days` (`REQ-SES-017`). Absent means «leave it». */
  requireAllDays?: boolean;
}

/** A stored day, as the page hands it to the form. */
export interface SavedDay {
  id: string;
  /** Wall clock in the session's zone, like every other value on this form. */
  startsAt: string;
  /** `""` when the day's end is exactly start + duration, so it keeps following it. */
  endsAt: string;
  venueId: string;
  customVenueName: string;
  customVenueAddress: string;
  customVenueMapUrl: string;
  /** Whether the day holds a check-in — removed or not. Its removal is refused. */
  hasAttendance: boolean;
  /** Materials, tasks and photos filed under this day. They are PROMOTED, never deleted. */
  contentCount: number;
}

const LABEL_KEY: Record<(typeof SCHEDULE_FIELDS)[number], string> = {
  startsAt: "startsAt.label",
  durationMinutes: "duration.label",
  endMode: "ends.label",
  endsAt: "ends.label",
  days: "days.legend",
  requireAllDays: "requireAllDays.label",
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

type Stamped<T> = { attempt: number; value: T };

/** A stored day, as the day list edits it. */
function draftOf(day: SavedDay): DayDraft {
  return {
    id: day.id,
    key: day.id,
    startsAt: day.startsAt,
    endsAt: day.endsAt,
    venueChoice: day.customVenueName ? CUSTOM_VENUE : day.venueId,
    customVenueName: day.customVenueName,
    customVenueAddress: day.customVenueAddress,
    customVenueMapUrl: day.customVenueMapUrl,
  };
}

/**
 * What travels in the hidden `days` field — spelled out rather than spread, so
 * this list IS the wire shape and `key`, which is React's and not the server's,
 * cannot ride along by accident.
 */
function payloadOf(day: DayDraft) {
  return {
    id: day.id,
    startsAt: day.startsAt,
    endsAt: day.endsAt,
    venueChoice: day.venueChoice,
    customVenueName: day.customVenueName,
    customVenueAddress: day.customVenueAddress,
    customVenueMapUrl: day.customVenueMapUrl,
  };
}

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
  // ★ Contract 7's catalogue, read and never written here: one formatter names
  // a day, and `content`'s slots, `checkin`'s screens and `notify`'s mail read
  // the same words. A second «اليوم الثاني» in `schedule.json` is exactly the
  // drift the contract exists to stop.
  const tDays = useTranslations("sessions.days");
  const tUi = useTranslations("ui");
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
  // The custom place's three inputs are UNCONTROLLED — `defaultValue` plus
  // `was()` is what survives React's form reset. What they hold is mirrored
  // here so two things can read the form AS IT STANDS rather than as it was
  // last saved: the publish gate below, and day one's entry in the day set.
  const [customFilled, setCustomFilled] = useState({
    name: was(state, "customVenueName") || initial.customVenueName,
    address: was(state, "customVenueAddress") || initial.customVenueAddress,
    mapUrl: was(state, "customVenueMapUrl") || initial.customVenueMapUrl,
  });
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

  // ── The day set (REQ-SES-015, REQ-SES-016) ───────────────────────────────
  // ★ Day one is NOT in `extras`. Its window and place are the controls above,
  // unmoved and unrenamed, which is what makes a one-day form identical to
  // wave 8's — only its stored `id` is carried, so a save moves the day rather
  // than replacing it.
  const saved = initial.days ?? [];
  const [multiDay, setMultiDay] = useState(saved.length > 1);
  const [extras, setExtras] = useState<DayDraft[]>(() => saved.slice(1).map(draftOf));
  const [nextKey, setNextKey] = useState(saved.length);
  const [requireAllDays, setRequireAllDays] = useState(initial.requireAllDays ?? true);
  const keyPrefix = useId();

  const endsAt = endMode === "explicit" ? explicitEnd : followingEnd(startsAt, duration);
  const rsvpDeadlineAt = deadlineFor(rsvpPreset, startsAt, rsvpCustom);
  const cancellationCutoffAt = deadlineFor(cutoffPreset, startsAt, cutoffCustom);

  /** Day one as a draft: the controls above, plus the stored id. */
  const dayOne: DayDraft = {
    id: saved[0]?.id ?? null,
    key: "day-1",
    startsAt,
    endsAt: endMode === "explicit" ? explicitEnd : "",
    venueChoice,
    customVenueName: customFilled.name,
    customVenueAddress: customFilled.address,
    customVenueMapUrl: customFilled.mapUrl,
  };
  /** The whole set, in the order the form renders it. Day one is always first. */
  const allDays: DayDraft[] = [dayOne, ...extras];
  /** The resolved windows, for validation and for what the page says. */
  const windows = allDays.map((day) => ({ startsAt: day.startsAt, endsAt: dayEnd(day, duration) }));
  const savedById = new Map(saved.map((day) => [day.id, day]));
  const [confirm, setConfirm] = useState<{ kind: "one"; index: number } | { kind: "all" } | null>(null);

  /**
   * ★ WHETHER THE FORM SPEAKS DAYS AT ALL, and the rule the wave turns on.
   *
   * Both halves are needed. Without the first, adding a day would not reach the
   * RPC; without the second, REMOVING the last extra day would send no `days`
   * field and `schedule_session()` would leave the stored day two exactly where
   * it was. With both, a session that has always had one day and an admin who
   * never opened the affordance post no `days` key at all — and that is main's
   * call, byte for byte.
   */
  const sendsDays = allDays.length > 1 || saved.length > 1;

  /** The day a confirm is about, and what removing it would cost. */
  const confirmDay = confirm?.kind === "one" ? extras[confirm.index] : null;
  const confirmPosition = confirm?.kind === "one" ? confirm.index + 2 : 0;
  const confirmName = confirmDay
    ? confirmDay.startsAt
      ? dayLabel({ position: confirmPosition, startsAt: `${confirmDay.startsAt}:00Z` }, "UTC", tDays)
      : dayShortLabel({ position: confirmPosition, startsAt: "" }, tDays)
    : "";
  const confirmContent = confirmDay ? (savedById.get(confirmDay.id ?? "")?.contentCount ?? 0) : 0;
  const confirmDescription =
    confirm?.kind === "all"
      ? t("days.confirm.allNote", { count: extras.length, value: formatNumber(extras.length) })
      : confirmContent > 0
        ? t("days.confirm.promotes", { count: confirmContent, value: formatNumber(confirmContent) })
        : t("days.confirm.oneNote");

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
  // ★ A DAY'S TWO RELATIONS ARE DERIVED ON EVERY RENDER, not stamped into the
  // overlay above. A date PICKER commits a whole value — there is no
  // half-typed date to be rude about (REQ-UIX-011) — so «live» and «on commit»
  // are the same moment for it, which is already why `recheck` runs from the
  // pickers' own `onChange`. Deriving costs nothing and cannot go stale.
  const dayRelations = checkDays(windows);

  const shown = (field: ScheduleField): string | undefined => {
    // Day one has no card: an overlap involving it is said at «التاريخ والوقت»,
    // the control that would be moved to fix it.
    if (field === "startsAt" && dayRelations[0] === "daysOverlap") return "daysOverlap";
    return field in fresh ? (fresh[field] ?? undefined) : state.errors[field];
  };
  const err = (field: ScheduleField) => {
    const key = shown(field);
    return key ? t(`errors.${key}`) : undefined;
  };

  /** A day CARD's failure — day one's two windows are `shown()`'s, above. */
  const dayErrorKey = (index: number, field: DayField): string | undefined => {
    if (field === "startsAt" && dayRelations[index] === "daysOverlap") return "daysOverlap";
    if (field === "endsAt" && dayRelations[index] === "dayEndBeforeStart") return "dayEndBeforeStart";
    return state.errors[`days.${index}.${field}`];
  };
  const dayErr = (index: number, field: DayField) => {
    const key = dayErrorKey(index, field);
    return key ? t(`errors.${key}`) : undefined;
  };

  // ── Picker commits ───────────────────────────────────────────────────────
  const onStart = (value: string | null) => {
    const next = value ?? "";
    setStartsAt(next);
    recheck({
      startsAt: next,
      endsAt: endMode === "explicit" ? explicitEnd : followingEnd(next, duration),
      rsvpDeadlineAt: deadlineFor(rsvpPreset, next, rsvpCustom),
      cancellationCutoffAt: deadlineFor(cutoffPreset, next, cutoffCustom),
    });
  };

  /** A wall clock as the house sentence — the date only when it is not the start's day. */
  const spoken = (local: string, withDate: boolean) => {
    const iso = atZone(local, timeZone);
    if (!iso) return "";
    const startIso = atZone(startsAt, timeZone);
    return withDate || !startIso || !sameDay(iso, startIso, timeZone) ? formatDateTime(iso, timeZone, locale) : formatTime(iso, timeZone, locale);
  };

  // ── Publish ──────────────────────────────────────────────────────────────
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
  // A deadline's error points at its picker when there is one, else at its preset.
  const targetOf = (field: ScheduleField): string =>
    field === "rsvpDeadlineAt" && rsvpPreset !== "custom" ? "rsvpPreset"
    : field === "cancellationCutoffAt" && cutoffPreset !== "custom" ? "cutoffPreset"
    : field;
  const DAY_FIELDS: DayField[] = ["startsAt", "endsAt", "venueChoice", "customVenueName", "customVenueAddress"];
  const summary = SCHEDULE_FIELDS.flatMap((field) => {
    // ★ `days` is one FormData field carrying a list, so it expands here into
    // the failures of the cards on the page, in day order — the summary's
    // first link stays the first problem on the page (DEC-144).
    if (field === "days") {
      return extras.flatMap((day, i) => {
        const index = i + 1;
        const name = dayShortLabel({ position: index + 1, startsAt: day.startsAt }, tDays);
        return DAY_FIELDS.flatMap((f) => {
          const key = dayErrorKey(index, f);
          return key
            ? [{ fieldId: dayFieldId(index, f), label: `${name}: ${t(`days.field.${f}`)}`, message: t(`errors.${key}`) }]
            : [];
        });
      });
    }
    const key = shown(field);
    return key ? [{ fieldId: targetOf(field), label: t(LABEL_KEY[field]), message: t(`errors.${key}`) }] : [];
  });

  /**
   * A deadline is ONE select — «عند بدء الجلسة» and the rest — with the time it
   * resolves to said beneath it, and a picker only for «موعد آخر». Two four-row
   * radio lists made the phone form a third longer for a choice most admins
   * never change (the lead's review of its own 390 px capture).
   */
  const deadline = (kind: "rsvp" | "cutoff") => {
    const isRsvp = kind === "rsvp";
    const presetField = isRsvp ? "rsvpPreset" : "cutoffPreset";
    const valueField = isRsvp ? "rsvpDeadlineAt" : "cancellationCutoffAt";
    const preset = isRsvp ? rsvpPreset : cutoffPreset;
    const custom = isRsvp ? rsvpCustom : cutoffCustom;
    const resolved = isRsvp ? rsvpDeadlineAt : cancellationCutoffAt;
    const legend = t(isRsvp ? "rsvpDeadline.legend" : "cutoff.legend");
    const setPreset = isRsvp ? setRsvpPreset : setCutoffPreset;
    const setCustom = isRsvp ? setRsvpCustom : setCutoffCustom;
    return (
      <div className="space-y-3">
        <Field
          id={presetField}
          label={legend}
          hint={preset !== "custom" && resolved ? t(isRsvp ? "rsvpDeadline.closes" : "cutoff.closes", { when: spoken(resolved, true) }) : undefined}
          error={preset === "custom" ? undefined : err(valueField)}
        >
          <Select
            name={presetField}
            value={preset}
            onChange={(e) => {
              const next = e.currentTarget.value as DeadlinePreset;
              if (next === "custom" && !custom) setCustom(resolved);
              setPreset(next);
              recheck({ [valueField]: deadlineFor(next, startsAt, custom || resolved) });
            }}
          >
            {DEADLINE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {t(`preset.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        {preset === "custom" ? (
          <Field id={valueField} label={t("preset.customLabel")} error={err(valueField)} className="ps-4">
            <DateTime
              name={valueField}
              label={legend}
              value={custom}
              onChange={(value) => {
                setCustom(value ?? "");
                recheck({ [valueField]: value ?? "" });
              }}
            />
          </Field>
        ) : null}
      </div>
    );
  };

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
        <div className="space-y-6">
          <Field id="startsAt" label={t("startsAt.label")} hint={t("startsAt.hint")} error={err("startsAt")} required>
            <DateTime name="startsAt" label={t("startsAt.label")} value={startsAt} onChange={onStart} />
          </Field>

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
              <Field id="endsAt" label={t("ends.label")} hint={t("ends.hint")} error={err("endsAt")}>
                <DateTime
                  name="endsAt"
                  label={t("ends.label")}
                  value={explicitEnd}
                  onChange={(value) => {
                    setExplicitEnd(value ?? "");
                    recheck({ endsAt: value ?? "" });
                  }}
                />
              </Field>
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

          {/* ── جلسة متعدّدة الأيام — REQ-SES-015, REQ-SES-016, DEC-119 ──── */}
          {/* ★ ONE DAY IS THE DEFAULT AND COSTS NOTHING. With the switch off,
              everything above is exactly what wave 8 shipped — the same fields,
              the same order, the same strings — and this one control at the end
              of the section is the whole of what an admin who never schedules a
              workshop ever sees of days. */}
          <div className="border-t border-edge pt-6">
            <Switch
              checked={multiDay}
              onCheckedChange={(on) => {
                if (on) setMultiDay(true);
                else if (extras.length === 0) setMultiDay(false);
                // Turning it off with days on the page removes them, so it
                // asks first and names every one (DEC-121).
                else setConfirm({ kind: "all" });
              }}
              label={t("days.switch")}
              description={t("days.switchHint")}
            />

            {multiDay ? (
              <div className="mt-6 space-y-5">
                <p className="text-body-sm text-fg-muted">{t("days.intro", { count: allDays.length, value: formatNumber(allDays.length) })}</p>
                {extras.map((day, i) => (
                  <DayCard
                    key={day.key}
                    day={day}
                    index={i + 1}
                    duration={duration}
                    venues={venues}
                    saved={savedById.get(day.id ?? "") ?? null}
                    error={dayErr}
                    spoken={spoken}
                    tDays={tDays}
                    t={t}
                    onChange={(next) => setExtras((list) => list.map((d, j) => (j === i ? next : d)))}
                    onRemove={() => setConfirm({ kind: "one", index: i })}
                  />
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    // ★ REQ-SES-016: «each added day defaults to the previous
                    // day's time and place», so a third evening is one tap.
                    const previous = allDays[allDays.length - 1];
                    setExtras((list) => [...list, nextDayAfter({ ...previous, endsAt: dayEnd(previous, duration) === followingEnd(previous.startsAt, duration) ? "" : previous.endsAt }, duration, `${keyPrefix}-${nextKey}`)]);
                    setNextKey((n) => n + 1);
                  }}
                >
                  {t("days.add")}
                </Button>
              </div>
            ) : null}
          </div>

          {/* ★ ABSENT unless the session really has more than one day: with no
              `days` field, `schedule_session()` takes main's path exactly
              (`tests/unit/schedule-days.test.ts` pins the argument object). */}
          {sendsDays ? <input type="hidden" name="days" value={JSON.stringify(allDays.map(payloadOf))} /> : null}
        </div>
      </section>

      {/* ── أين ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="schedule-where" className="space-y-6">
        <SectionHeader id="schedule-where" title={t("sections.where")} />
        {/* The venue control does not move when days appear: it is day one's,
            and every day after it inherits this place until someone changes
            that day. Said once, here, rather than repeated on every card. */}
        {multiDay ? <p className="text-body-sm text-fg-muted">{t("days.placeNote")}</p> : null}
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
              <Input
                name="customVenueMapUrl"
                type="url"
                dir="ltr"
                defaultValue={was(state, "customVenueMapUrl") || initial.customVenueMapUrl}
                onChange={(e) => setCustomFilled((c) => ({ ...c, mapUrl: e.currentTarget.value }))}
              />
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
        <div className="space-y-6">
          {deadline("rsvp")}
          {deadline("cutoff")}

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
        {/* ★ REQ-SES-017 puts this beside `certificate_mode`, where that
            judgement already lives — and INSIDE the multi-day affordance,
            because «attended every day» is «attended» at one day and the
            control would be a question with one answer.

            The hidden input is what actually posts: a Radix switch sends
            nothing when it is off, which the action would have to read as
            «unchanged» rather than as «false». Absent (the affordance closed)
            IS «unchanged»; present-and-false is a decision. */}
        {multiDay ? (
          <div>
            <Switch checked={requireAllDays} onCheckedChange={setRequireAllDays} label={t("requireAllDays.label")} description={t("requireAllDays.hint")} />
            <input type="hidden" name="requireAllDays" value={requireAllDays ? "true" : "false"} />
          </div>
        ) : null}
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
          // One line, not a heading and a list: the bar sits above the tab bar in a
          // 844 px viewport, and every line it takes is a line of form it hides.
          <p className="mb-3 text-body-sm text-fg-body">
            <span className="text-label text-fg-heading">{t("missing.title")}</span> {missing.map((m) => t(`missing.${m}`)).join(" · ")}
          </p>
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

      {/* ★ REMOVING A DAY ASKS, AND NAMES IT (DEC-121). Nothing is deleted as a
          side effect of a scheduling change: a day's materials, tasks and
          photos are PROMOTED to the session by `0100`'s foreign key, and the
          dialog says so before anything is sent. A day holding attendance has
          no remove control at all, and `schedule_session()` refuses it anyway. */}
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent
          title={confirm?.kind === "all" ? t("days.confirm.allTitle") : t("days.confirm.oneTitle", { day: confirmName })}
          description={confirmDescription}
          closeLabel={tUi("dialog.close")}
        >
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => {
                if (confirm?.kind === "one") setExtras((list) => list.filter((_, j) => j !== confirm.index));
                if (confirm?.kind === "all") {
                  setExtras([]);
                  setMultiDay(false);
                }
                setConfirm(null);
              }}
            >
              {t("days.confirm.remove")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
              {t("days.confirm.keep")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}

/**
 * One day after the first — `REQ-SES-016`'s «each added day defaults to the
 * previous day's time and place, both editable per day».
 *
 * ★ THE DATE PICKER IS DATE-ONLY BY DEFAULT. The clock already came from the
 * day before, so adding a third evening is one tap on a number; «غيّر الوقت»
 * reveals the minute picker for the day that really is different.
 *
 * ★ NO DRAG HANDLE AND NO ARROWS. `position` is the chronological rank `0100`
 * derives, so a day is moved by changing its date and the list re-sorts; a
 * reorder control could only ever disagree with the ranking the database
 * applies (DEC-150). That is one fewer control, not a missing one.
 *
 * ★ EVERY CONTROL HERE IS UNNAMED FOR THE FORM. The day set travels in ONE
 * hidden `days` field, so these post nothing of their own — which is also why
 * they are controlled rather than uncontrolled: there is no `defaultValue` for
 * React's form reset to restore, and what was typed lives in the parent's
 * state, which the reset does not touch (DEC-149 §1).
 */
function DayCard({
  day,
  index,
  duration,
  venues,
  saved,
  error,
  spoken,
  tDays,
  t,
  onChange,
  onRemove,
}: {
  day: DayDraft;
  /** The day's index in the whole set, so day two is `1`. */
  index: number;
  duration: string;
  venues: ScheduleVenue[];
  /** The stored row, when this day has been saved — what its removal would cost. */
  saved: SavedDay | null;
  error: (index: number, field: DayField) => string | undefined;
  spoken: (local: string, withDate: boolean) => string;
  tDays: (key: string, values?: Record<string, string | number>) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
  onChange: (next: DayDraft) => void;
  onRemove: () => void;
}) {
  const [timeShown, setTimeShown] = useState(false);
  const [placeShown, setPlaceShown] = useState(false);
  const position = index + 1;
  const end = dayEnd(day, duration);
  const custom = day.venueChoice === CUSTOM_VENUE;
  // The wall clock is already in the session's zone, so it is named as UTC to
  // be READ as the calendar it is — the same trick `rules.ts` uses for its
  // arithmetic, and the reason no zone is consulted twice.
  const heading = day.startsAt
    ? dayLabel({ position, startsAt: `${day.startsAt}:00Z` }, "UTC", tDays)
    : dayShortLabel({ position, startsAt: "" }, tDays);
  const set = (patch: Partial<DayDraft>) => onChange({ ...day, ...patch });

  return (
    <div className="rounded-card border border-edge p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-label text-fg-heading">{heading}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={saved?.hasAttendance ?? false}>
          {t("days.remove")}
        </Button>
      </div>
      {/* REQ-CHK-017: attendance is evidence, and a scheduling change does not
          delete it. `schedule_session()` refuses `day_has_attendance` too; this
          says so before an admin presses anything. */}
      {saved?.hasAttendance ? <p className="mb-4 text-caption text-fg-muted">{t("days.locked")}</p> : null}

      <div className="space-y-4">
        <Field id={dayFieldId(index, "startsAt")} label={t("days.field.startsAt")} error={error(index, "startsAt")}>
          <DateTime
            // Named for the browser and ignored by the action: the day set
            // travels in the hidden `days` field, and `SCHEDULE_FIELDS` does
            // not list these, so `formStateFrom()` never reads them.
            name={`day-${position}-startsAt`}
            // ★ ONE PHRASE, ONE COLON. `ui/date-time` names its trigger
            // «{label}: {value}» and its dialog «{label}», so a label that
            // already contains a colon gives «… : بداية اليوم: 12 أكتوبر» to a
            // screen reader and two different names to a test. «بداية اليوم
            // الثالث · السبت» reads as what it is.
            label={t("days.field.startsAtOf", { day: heading })}
            // ★ THE PICKER IS SYMMETRIC ABOUT ITS GRANULARITY: in date mode it
            // parses and returns «YYYY-MM-DD». Handing it the day's wall clock
            // made `parse()` return null and the trigger read «لم يُحدَّد بعد»
            // on a day whose heading and end line both said otherwise — and a
            // date picked in that mode came back CLOCKLESS, which broke the
            // end sentence, the overlap check and the save, each silently.
            granularity={timeShown ? "minute" : "date"}
            value={timeShown ? day.startsAt : dateOf(day.startsAt)}
            onChange={(value) => set({ startsAt: withSameClock(value ?? "", day.startsAt) })}
          />
        </Field>
        {timeShown ? null : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setTimeShown(true)}>
            {t("days.changeTime")}
          </Button>
        )}

        <div>
          <p className="text-body-sm text-fg-body" aria-live="polite">
            {end ? t("days.ends", { time: spoken(end, false) }) : t("ends.followsEmpty")}
          </p>
          {day.endsAt ? (
            <Field id={dayFieldId(index, "endsAt")} label={t("days.field.endsAt")} error={error(index, "endsAt")} className="mt-2">
              <DateTime name={`day-${position}-endsAt`} label={t("days.field.endsAtOf", { day: heading })} value={day.endsAt} onChange={(value) => set({ endsAt: value ?? "" })} />
            </Field>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => set({ endsAt: day.endsAt ? "" : end })}>
            {t(day.endsAt ? "ends.follow" : "ends.edit")}
          </Button>
        </div>

        {placeShown || custom || !day.venueChoice ? (
          <>
            <Field id={dayFieldId(index, "venueChoice")} label={t("days.field.venueChoice")} error={error(index, "venueChoice")}>
              <Select value={day.venueChoice} onChange={(e) => set({ venueChoice: e.currentTarget.value })}>
                <option value="">{t("venue.placeholder")}</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                <option value={CUSTOM_VENUE}>{t("venue.other")}</option>
              </Select>
            </Field>
            {custom ? (
              <div className="space-y-4 border-s-2 border-edge ps-4">
                <Field id={dayFieldId(index, "customVenueName")} label={t("venue.customName")} required error={error(index, "customVenueName")}>
                  <Input maxLength={120} value={day.customVenueName} onChange={(e) => set({ customVenueName: e.currentTarget.value })} />
                </Field>
                <Field id={dayFieldId(index, "customVenueAddress")} label={t("venue.customAddress")} required error={error(index, "customVenueAddress")}>
                  <Input maxLength={300} value={day.customVenueAddress} onChange={(e) => set({ customVenueAddress: e.currentTarget.value })} />
                </Field>
              </div>
            ) : null}
          </>
        ) : (
          <div>
            <p className="text-body-sm text-fg-muted">{t("days.samePlace", { name: venues.find((v) => v.id === day.venueChoice)?.name ?? "" })}</p>
            <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setPlaceShown(true)}>
              {t("days.changePlace")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
