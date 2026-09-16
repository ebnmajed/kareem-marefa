"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// One brand colour token: a swatch, a hex input, both controlled and kept
// in sync from the same piece of state (REQ-DSG-021, SCR-059). Fully
// controlled rather than `defaultValue` — React re-asserts the DOM value on
// every render, so a failed save action's native form reset (React 19) is
// never visible here, and the live preview updates on every keystroke.
//
// `<Field>` is the one wrapper (`16` §8.2 item 1, REQ-UIX-001) — its
// context wires `htmlFor`/`aria-describedby`/`aria-invalid` onto `Input`,
// the REAL control; the native `<input type="color">` beside it is a
// decorative quick-pick (`aria-hidden`, `tabIndex={-1}`), never the thing a
// screen reader or a keyboard user is sent to. A malformed hex shows as an
// adjacent, red, icon-marked error through `Field`'s own error slot
// (REQ-UIX-010) rather than a colour with no visible feedback at all.
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function ColourField({
  name,
  label,
  value,
  onChange,
  id,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  id: string;
}) {
  const t = useTranslations("branding.colours");
  const valid = HEX_RE.test(value);

  return (
    <Field id={id} label={label} error={valid ? undefined : t("invalidHex")}>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-hidden="true"
          tabIndex={-1}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-11 shrink-0 cursor-pointer rounded-field border border-edge bg-transparent p-0.5"
        />
        <Input name={name} type="text" dir="ltr" inputMode="text" maxLength={7} value={value} onChange={(e) => onChange(e.target.value)} className="flex-1" />
      </div>
    </Field>
  );
}
