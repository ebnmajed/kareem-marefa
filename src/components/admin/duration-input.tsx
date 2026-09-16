"use client";

import { useTranslations } from "next-intl";
import { useFieldWiring } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { DurationUnit } from "./duration";

// A duration as an admin types it: a whole number and a unit (`duration.ts`
// converts). The reminder schedule's offsets and the scoring catalogue's
// cooldowns — a raw count of minutes or seconds is a machine's unit, and
// «10080» is not how anyone thinks of a week.
//
// Inside `<Field>`: the number takes the Field's id (its `<label for>` names
// it), and the unit takes `<id>-unit` with an accessible name of its own,
// «<label> — الوحدة» — a second control cannot share the first one's id. Both
// carry the Field's error and invalid state.
//
// Controlled when `amount`/`unit` are given (a row the form adds and removes),
// otherwise uncontrolled from `defaultAmount`/`defaultUnit`.
export function DurationInput({
  label,
  amountName,
  unitName,
  units,
  amount,
  unit,
  defaultAmount,
  defaultUnit,
  onAmountChange,
  onUnitChange,
  max,
}: {
  /** The Field's label, for the unit select's own accessible name. */
  label: string;
  amountName: string;
  unitName: string;
  units: readonly DurationUnit[];
  amount?: string;
  unit?: DurationUnit;
  defaultAmount?: string;
  defaultUnit?: DurationUnit;
  onAmountChange?: (amount: string) => void;
  onUnitChange?: (unit: DurationUnit) => void;
  max?: number;
}) {
  const t = useTranslations("admin.duration");
  const field = useFieldWiring();

  return (
    // One row, the number narrow beside the unit. A width class on the control
    // itself does nothing: `controlClass`' `w-full` is emitted after `w-28` and
    // wins, which stacked two full-width controls per reminder on a phone
    // (sync 2). The wrappers size them; each control fills its own.
    <div className="flex items-center gap-2">
      <div className="w-24 shrink-0">
        <Input
          name={amountName}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={1}
          dir="ltr"
          className="text-center"
          value={amount}
          defaultValue={amount === undefined ? defaultAmount : undefined}
          onChange={onAmountChange ? (e) => onAmountChange(e.target.value) : undefined}
        />
      </div>
      <div className="min-w-0 flex-1 sm:max-w-48">
        <Select
          id={field ? `${field.id}-unit` : undefined}
          name={unitName}
          aria-label={t.markup("unitLabel", { field: label, bdi: (chunks) => chunks })}
          value={unit}
          defaultValue={unit === undefined ? defaultUnit : undefined}
          onChange={onUnitChange ? (e) => onUnitChange(e.target.value as DurationUnit) : undefined}
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {t(`units.${u}`)}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
