"use client";

import type { InputProps, Size } from "@/components/ui";
import { controlClass, describedIds, useFieldWiring } from "@/components/ui/field";

// The house text input — `16` §4.2, REQ-UIX-009.
//
// It carries no accessibility of its own: `<Field>` owns the label, the hint,
// the error and the aria, and this reads them off the context. Everything an
// explicit prop sets wins, and outside a `<Field>` this is an ordinary input
// with the house classes.
//
// ★ `size` IS THE DESIGN SIZE, not HTML's visible-character-width attribute —
// `InputProps` omits the native one, and the design value must not reach the
// element or the browser sizes the box in characters.
//
// ★ `startIcon` IS DRAWN HERE, AND SO IS THE PADDING THAT CLEARS IT. The shell
// search used to position its own glyph and pass `ps-10` over the size's
// `px-4` — two utilities setting `padding-inline-start`, correct only by the
// luck of Tailwind's emit order (DEC-111, DEC-133). Now the caller hands over
// the glyph and nothing else; the input switches to `ps-* pe-*` itself.

// The glyph's own inset and size, per control size, so the text clears it by
// the same ~12 px gap at every size.
const iconSlot: Record<Size, string> = {
  sm: "ps-2.5 text-base",
  md: "ps-3.5 text-[1.125rem]",
  lg: "ps-3.5 text-[1.125rem]",
};

export function Input({ invalid, size = "md", startIcon, className = "", "aria-describedby": describedBy, ...props }: InputProps) {
  const field = useFieldWiring();
  const isInvalid = invalid ?? field?.invalid ?? false;

  const control = (
    // ui-lint-disable-next-line field — this IS what <Field> wraps (`16` §17)
    <input
      id={field?.id}
      // ★ MERGED, not overridden. A caller pointing at one more element — a
      // character counter, a format note — must not silently drop the Field's
      // own error and hint, which is the one association nothing else supplies.
      aria-describedby={describedIds(field?.describedBy, describedBy)}
      aria-invalid={isInvalid || undefined}
      aria-required={field?.required || undefined}
      className={controlClass(isInvalid, size, className, { startIcon: Boolean(startIcon) })}
      {...props}
    />
  );

  if (!startIcon) return control;

  return (
    <span className="relative block min-w-0">
      {/* Decorative: the field is named by its label, never by its glyph. It
          ignores the pointer so a tap on it still lands in the input. */}
      <span
        aria-hidden="true"
        data-slot="start-icon"
        className={`pointer-events-none absolute inset-y-0 start-0 flex items-center text-fg-muted ${iconSlot[size]}`}
      >
        {startIcon}
      </span>
      {control}
    </span>
  );
}
