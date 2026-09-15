"use client";

import { useEffect, useId, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RtlDateTimePicker } from "@/components/admin/rtl-datetime-picker";
import type { NumeralSystem } from "@/components/sessions/numerals";
import type { DateTimeProps } from "@/components/ui";

// `console`'s file — ADOPTS the RTL picker built for SCR-043 (DEC-045)
// rather than replacing it (`16` §4.2). `rtl-datetime-picker.tsx` is not in
// this track's M9 edit list, so it is imported unchanged; this module is
// only the seam onto `DateTimeProps`.
//
// Two real gaps in the frozen contract, both documented at length in
// `docs/plan/notes/console.md` ("Three real gaps…") and repeated here in
// short form so they are not missed at the one call site that reads this
// file in isolation:
//
//  1. `DateTimeProps` carries no `label`. The adopted picker's trigger is a
//     `<button>` whose accessible name has to combine the field's meaning
//     with the LIVE value (its own comment explains why a plain
//     `<label for>` can't do this — the name would freeze at mount). With
//     no field-specific label to build that from, the trigger falls back to
//     a generic `admin.dateTime.triggerLabel` — every `<DateTime>` on a page
//     with more than one date field is indistinguishable by name alone
//     until the type gains one.
//  2. Neither `numerals` nor `locale` travel through `DateTimeProps` — no
//     client component anywhere in `src/` reads them from a context, only
//     ever as a prop from a server-rendered parent. `locale` comes from
//     `useLocale()` for free; `numerals` is an EXCESS optional prop here,
//     defaulting to `"western"` (`org_settings.numerals`'s own column
//     default, `0004_tenancy.sql:113`), so an org that never overrides the
//     setting sees no drift from the adopted picker's previous callers.
//
// `granularity: "date"` has no equivalent in the adopted picker (it always
// shows hour/minute controls) — SCR-043's four fields are all
// date-AND-time, so this was never built, and DEC-045's own scope never
// asked for it. A date-only field falls back to a native `<input
// type="date">`, matching the day-one STUB's own choice for that branch.
//
// `min`/`max` are accepted (the contract asks for them) but not enforced by
// the adopted picker's calendar grid — editing it to add bounds-checking is
// out of this track's M9 edit list. Consistent with "validation checks
// shape, not authority": the actual boundary is server-side, same as every
// other field in this product.

export function DateTime(props: DateTimeProps & { numerals?: NumeralSystem }) {
  // `timeZone` is accepted by the contract and intentionally unused here —
  // the adopted picker is a wall-clock control, same as the native
  // `datetime-local` input it replaces; the zone is applied server-side
  // (`schedule-form.tsx`'s own `atZone()`), never in this component.
  const { id, name, defaultValue, value, onChange, min, max, granularity = "minute", invalid, className = "", numerals = "western" } = props;
  const generated = useId();
  const fieldId = id ?? generated;
  const locale = useLocale();
  const t = useTranslations("admin.dateTime");
  const containerRef = useRef<HTMLDivElement>(null);
  const lastReported = useRef<string | null>(value ?? defaultValue ?? null);

  // `RtlDateTimePicker` has no `onChange` of its own (it is a plain
  // uncontrolled form field, like the native input it replaces) — its
  // internal `setValue` re-renders happen inside React's own batched
  // commit, so an ancestor handler on the SAME click can't reliably read
  // the post-commit DOM value (see the note in console.md). What IS
  // reliably observable without editing that file: it sets
  // `aria-expanded` on its trigger button as an ATTRIBUTE (ARIA state is
  // always `setAttribute`, never a DOM property), so a `MutationObserver`
  // on that one attribute tells us exactly when the popover closes — the
  // moment a value is actually committed by the person using it.
  useEffect(() => {
    if (!onChange) return;
    const root = containerRef.current;
    if (!root) return;
    const trigger = root.querySelector<HTMLButtonElement>(`#${CSS.escape(fieldId)}-trigger`);
    const hidden = root.querySelector<HTMLInputElement>(`#${CSS.escape(fieldId)}`);
    if (!trigger || !hidden) return;
    const observer = new MutationObserver(() => {
      if (trigger.getAttribute("aria-expanded") === "false" && hidden.value !== lastReported.current) {
        lastReported.current = hidden.value;
        onChange(hidden.value === "" ? null : hidden.value);
      }
    });
    observer.observe(trigger, { attributes: true, attributeFilter: ["aria-expanded"] });
    return () => observer.disconnect();
  }, [fieldId, onChange]);

  if (granularity === "date") {
    return (
      // ui-lint-disable-next-line field — the primitive <Field> wraps
      <input
        id={fieldId}
        name={name}
        type="date"
        defaultValue={value === undefined ? (defaultValue ?? undefined) : undefined}
        value={value === undefined ? undefined : (value ?? "")}
        onChange={onChange ? (e) => onChange(e.target.value === "" ? null : e.target.value) : undefined}
        min={min}
        max={max}
        aria-invalid={invalid || undefined}
        className={className}
      />
    );
  }

  return (
    <div ref={containerRef} className={className}>
      <RtlDateTimePicker
        key={value !== undefined ? `controlled:${value}` : "uncontrolled"}
        id={fieldId}
        name={name}
        label={t("triggerLabel")}
        // `value === undefined` is "uncontrolled, use defaultValue"; an
        // explicit `null` is a controlled, deliberately-empty value — `??`
        // alone would conflate the two, since it treats both as absent.
        defaultValue={(value !== undefined ? value : defaultValue) ?? ""}
        numerals={numerals}
        locale={locale}
        clearLabel={t("clear")}
        todayLabel={t("today")}
        doneLabel={t("done")}
        hourLabel={t("hour")}
        minuteLabel={t("minute")}
        emptyLabel={t("empty")}
      />
    </div>
  );
}
