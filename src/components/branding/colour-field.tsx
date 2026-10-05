"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// One brand colour token in SCR-059's edit mode — REQ-DSG-021, REQ-UIX-116 (B14, B16, B17 in `notes/branding.md`).
//
// ★ CONTROLLED, never `defaultValue`: React re-asserts the value on every render, so a refused save (React 19 resets a
// `<form action>`) never loses what was typed, and the preview follows every keystroke.
// ★ The hex `Input` inside `<Field>` is THE control; the native picker beside it is a decorative quick-pick
// (`aria-hidden`, `tabIndex={-1}`). A malformed value shows its error at the field, `#rrggbb` isolated in
// `<bdi dir="ltr">` (an LTR token in an RTL sentence).
// ★ A changed field says so twice — the accent outline AND «(معدّل)» in its accessible name, never colour alone
// (DEC-231 §3, SC 1.4.1).

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function ColourField({
  id,
  name,
  label,
  value,
  changed,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  changed: boolean;
  onChange: (next: string) => void;
}) {
  const t = useTranslations("branding");
  const valid = HEX_RE.test(value);

  return (
    <Field
      id={id}
      label={
        <>
          {label}
          {changed ? <span className="sr-only"> {t("editMode.changed")}</span> : null}
        </>
      }
      error={valid ? undefined : t.rich("colours.invalidHex", { bdi: (chunks) => <bdi dir="ltr">{chunks}</bdi> })}
    >
      <div className={`flex items-center gap-3 ${changed ? "rounded-field outline-2 outline-accent" : ""}`}>
        <span
          aria-hidden="true"
          className={`relative inline-block size-11 shrink-0 overflow-clip rounded-full border border-edge ${valid ? "bg-team" : "opacity-50"}`}
          style={valid ? ({ "--team": value } as CSSProperties) : undefined}
        >
          <input
            type="color"
            tabIndex={-1}
            aria-hidden="true"
            value={valid ? value.toLowerCase() : "#9ca3af"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        <Input name={name} type="text" dir="ltr" inputMode="text" maxLength={7} value={value} onChange={(e) => onChange(e.target.value)} className="flex-1" />
      </div>
    </Field>
  );
}
