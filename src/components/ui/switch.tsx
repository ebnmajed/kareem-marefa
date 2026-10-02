"use client";

import { useId, useLayoutEffect, useRef } from "react";
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

// ★★ A CONTROLLED SWITCH SURVIVES A FORM RESET (REQ-UIX-011). React calls the
// native `form.reset()` after every `<form action>` submission, refusal or
// success, and it never moves a controlled checkbox's `defaultChecked` off its
// mount value — so the input fell back to it while the state held the other,
// and the next submission posted the fallen-back value. A layout effect runs
// after the reset in the same commit and puts both back to `checked`. An
// uncontrolled switch's `defaultChecked` is React's to keep (it follows the
// prop, which a refused form echoes from its state).
// ★ `labelHidden` (wave 22, DEC-232 §6, add-only) — a switch in a table cell, whose row already names it on screen.
// The label stays INSIDE the `<label>`, so it is still the input's accessible name; only its drawing goes. `sr-only` is
// absolutely positioned, so it leaves the flex row and the track sits alone.
export function Switch({ label, labelHidden = false, description, checked, defaultChecked, onCheckedChange, disabled, name, className = "" }: SwitchProps) {
  const descriptionId = useId();
  const controlled = checked !== undefined;
  const input = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const node = input.current;
    if (!node || checked === undefined) return;
    if (node.defaultChecked !== checked) node.defaultChecked = checked;
    if (node.checked !== checked) node.checked = checked;
  });

  return (
    <div className={className}>
      <label
        className={`flex min-h-11 items-center gap-3 text-body text-fg-body ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        {/* ui-lint-disable-next-line field — the label IS the wrapper (`16` §17) */}
        <input
          ref={input}
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
          //
          // ★ WAVE 15 (DEC-186 §2, §6). The scope reassigns `--edge-strong`,
          // `--btn-bg`, `--bg` and `--ring`, so the two tracks, the thumb and
          // the ring's colour follow it. Two classes are ADDED:
          //   · the ring's WIDTH — this is the one ring the switch draws itself
          //     (the input is `sr-only`, so the scope's own `:focus-visible`
          //     rule lands on nothing visible), and the scope's ring is 3 px;
          //   · the ON track on the light variant. The accent is lime, which is
          //     1.07:1 on paper, and the thumb is paper — an ON switch there
          //     would be a white dot on a white field. The text colour is
          //     16.7:1 on paper and on the thumb, so the state reads.
          className="flex h-6 w-11 shrink-0 items-center justify-start rounded-full bg-edge-strong p-0.5 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] peer-checked:justify-end peer-checked:bg-[var(--btn-bg)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)] peer-disabled:opacity-60 pg:peer-focus-visible:outline-[length:var(--focus-width)] pg-light:peer-checked:bg-fg-heading"
        >
          <span className="size-5 rounded-full bg-canvas" />
        </span>
        <span className={labelHidden ? "sr-only" : "text-label text-fg-heading"}>{label}</span>
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
