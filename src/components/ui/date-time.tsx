"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RtlDateTimePicker } from "@/components/admin/rtl-datetime-picker";
import { useFieldWiring } from "@/components/ui/field";
import type { DateTimeProps } from "@/components/ui";

// `console`'s file — ADOPTS the RTL picker built for SCR-043 (DEC-045)
// rather than replacing it (`16` §4.2); this module is the seam onto
// `DateTimeProps`.
//
// ★ Inside `<Field>` it is a control like `Input`: the Field draws the label,
// «مطلوب», the hint and the error, and this reads the wiring off the context —
// the picker then draws no label of its own, its TRIGGER takes the Field's id
// (so `<label for>` reaches the element that takes focus), and the trigger
// carries the Field's `aria-describedby` and `aria-invalid`. Outside a Field
// the picker draws its own label, as the schedule form's standalone pickers
// always have.
//
// `label` names the trigger — «آخر موعد للحجز: 17 سبتمبر 2026 …» — so four
// pickers on one form are not four «التاريخ والوقت» (wave 8, the lead's
// request). Without it the generic `admin.dateTime.triggerLabel` stands in.
//
// `onChange` fires on every commit and every clear, from the picker's own
// `onValueChange`; a controlled `value` is passed straight through, never a
// remount, so the popover stays open while the member picks a day and then an
// hour.
//
// `granularity: "date"` is the same picker in date-only mode — never a native
// `type="date"`, whose mask is the browser's English `dd/mm/yyyy`.
//
// `timeZone` is accepted by the contract and intentionally unused here — the
// picker is a wall-clock control; the zone is applied server-side where the
// value is read.

export function DateTime({ id, name, label, defaultValue, value, onChange, min, max, granularity = "minute", invalid, className = "" }: DateTimeProps) {
  const field = useFieldWiring();
  const generated = useId();
  const fieldId = id ?? field?.id ?? generated;
  const locale = useLocale();
  const t = useTranslations("admin.dateTime");

  return (
    <div className={className}>
      <RtlDateTimePicker
        id={fieldId}
        name={name}
        label={label ?? t(granularity === "date" ? "triggerLabelDate" : "triggerLabel")}
        required={field?.required}
        defaultValue={defaultValue ?? ""}
        // `undefined` is uncontrolled; an explicit `null` is a controlled,
        // deliberately empty value — `??` alone would conflate the two.
        value={value === undefined ? undefined : (value ?? "")}
        onValueChange={onChange ? (next) => onChange(next === "" ? null : next) : undefined}
        dateOnly={granularity === "date"}
        hideLabel={field !== null}
        describedBy={field?.describedBy}
        invalid={invalid ?? field?.invalid ?? false}
        min={min}
        max={max}
        locale={locale}
        clearLabel={t("clear")}
        todayLabel={t("today")}
        doneLabel={t("done")}
        hourLabel={t("hour")}
        minuteLabel={t("minute")}
        emptyLabel={t("empty")}
        prevMonthLabel={t("prevMonth")}
        nextMonthLabel={t("nextMonth")}
      />
    </div>
  );
}
