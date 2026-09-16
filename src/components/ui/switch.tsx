"use client";

import { useId } from "react";
import type { SwitchProps } from "@/components/ui";

// The house switch — `16` §4.2, REQ-UIX-009, REQ-NFR-007.
//
// ★ A REAL `<input type="checkbox">` WITH `role="switch"`, not a `<button>`.
// `SwitchProps` carries a `name`, which means this control POSTS A VALUE, and
// a button posts nothing. The input is `sr-only` rather than hidden: it stays
// focusable and keyboard-operable, and the drawn track is `aria-hidden`
// decoration that follows it.
//
// ★★ THE THUMB MOVES BY `justify-content`, NOT BY `translate-x`, and that is
// the RTL decision in this file. A translate is PHYSICAL: `translate-x-5` moves
// the thumb to the right in both directions, so an Arabic member watches a
// switch turn on by sliding backwards. `justify-start` → `justify-end` moves it
// along the INLINE axis, which the document's direction already defines, so it
// is correct in both without a single `rtl:` variant — and `10` §2.3 is exact
// about why pairing `rtl:` with a physical utility would not have rescued it
// (the variant adds no specificity, so the physical utility wins).
//
// Movement is not animated. The tokens are in M9 and the nine moments are M10
// (DEC-100); `justify-content` is not an animatable property anyway, so an
// animated thumb is a `translate` — which is the bug above.

export function Switch({ label, description, checked, defaultChecked, onCheckedChange, disabled, name, className = "" }: SwitchProps) {
  const descriptionId = useId();
  const controlled = checked !== undefined;

  return (
    <div className={className}>
      <label
        className={`flex min-h-11 items-center gap-3 text-body text-fg-body ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        {/* ui-lint-disable-next-line field — the label IS the wrapper (`16` §17) */}
        <input
          type="checkbox"
          role="switch"
          name={name}
          disabled={disabled}
          aria-describedby={description ? descriptionId : undefined}
          className="peer sr-only"
          {...(controlled
            ? { checked, onChange: (e) => onCheckedChange?.(e.currentTarget.checked) }
            : { defaultChecked, onChange: (e) => onCheckedChange?.(e.currentTarget.checked) })}
        />
        <span
          aria-hidden
          // ★ THE OFF TRACK IS `--edge-strong`, NOT A SILVER, AND THAT IS
          // SC 1.4.11. The obvious `bg-silver-300` (#c9ced6) is 1.6:1 against
          // white and the white thumb on it is 1.3:1 — a switch whose state
          // nobody can see. `--edge-strong` (#767f8c) is the token globals.css
          // already annotates «input borders on white must meet 3:1»: 3.4:1
          // against the canvas AND against the thumb, so both boundaries that
          // carry the state clear the bar. On, the navy fill carries it.
          className="flex h-6 w-11 shrink-0 items-center justify-start rounded-full bg-edge-strong p-0.5 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] peer-checked:justify-end peer-checked:bg-[var(--btn-bg)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)] peer-disabled:opacity-60"
        >
          <span className="size-5 rounded-full bg-canvas" />
        </span>
        <span className="text-label text-fg-heading">{label}</span>
      </label>
      {/* ★ OUTSIDE the `<label>`. Inside it, the description joins the switch's
          ACCESSIBLE NAME as well as its description — read twice, and the
          control no longer findable by its own name. `ps-14` is the track plus
          the gap, in logical units. */}
      {description ? (
        <p id={descriptionId} className="ps-14 text-caption text-fg-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}
