import { Link } from "@/i18n/navigation";
import type { ComponentProps, ReactNode } from "react";
import type { ButtonProps, ButtonVariant, Size } from "@/components/ui";
import { SpinnerIcon } from "@/components/ui/icons";

// The house button — `16` §4.2, REQ-UIX-007.
//
// Extends the M0 button rather than replacing it: `primary` and `secondary`
// keep their exact class strings and their `--btn-*` token wiring, so every
// screen that already uses them is unchanged. What is added is `ghost`,
// `danger`, three sizes, and `pending`.
//
// ★★ THIS MODULE IS DELIBERATELY NOT `"use client"`, and that is not a detail.
// `src/app/[locale]/(marketing)/page.tsx:8` imports `ButtonLink` from here, and
// that page is the frozen public contract (invariant 1) until M13. A
// module-level `"use client"` would pull a live marketing page into the client
// graph for a pending state it has no use for. `16` §7.1 asks for
// `useFormStatus` "inside `ui/button`" — it lives in `ui/submit-button.tsx`,
// one import away, which is where it belongs anyway: `useFormStatus` is only
// meaningful on a button that submits the form it is inside.
//
// ★ PENDING KEEPS THE LABEL. A control that blanks its text while working
// costs the member the one thing they need — what they just pressed. The label
// stays, a spinner appears beside it, the control is `aria-busy` and cannot be
// submitted twice.

// ★★ WAVE 15 — «ساحة اللعب» (DEC-183, DEC-186 §2, REQ-UIX-030). EVERY CLASS
// BELOW THAT EXISTED BEFORE THE WAVE IS STILL HERE, UNCHANGED. The playground's
// face is ADDED under `pg:`, which means «inside the scope» and does nothing
// outside it — so `(marketing)/page.tsx`'s `ButtonLink` and every screen in the
// app render exactly as they did. Contract 5 proves it on the public routes.
//
// Inside the scope the colours arrive by themselves: the scope reassigns
// `--btn-bg`, `--btn-fg` and the `--btn2-*` names, as `.theme-dark` does. What
// a variable cannot carry is added here:
//   · the pill, and the press — a hard shadow under the control, and on
//     `:active` the control moves down onto it. TRANSFORM ONLY is transitioned
//     (REQ-UIX-020); the shadow's step is not. Nothing scales, on hover or ever.
//   · the display face on a primary and a secondary label, at `lg`.
//   · 52 px for `lg` — the direction's CTA height. `md` stays 44 and `sm` 36.
//   · `trailing`, an opt-in slot (`04-components.md`: «capacity chip in the trailing slot»):
//     a second flex child after the label, kept while pending, and inside the scope the label
//     stands at the start and the slot at the end. A button without it renders what it did.
// The focus ring is the scope's one rule; this file declares none for it.
const playBase = "pg:rounded-pill pg:transition-transform pg:duration-(--duration-fast) pg:ease-play";

export const buttonBase = `inline-flex items-center justify-center gap-2 rounded-field text-label transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${playBase}`;

// 44 px is the floor (REQ-NFR-007); `md` and `lg` clear it, and `sm` is for
// dense console rows where the row itself is the target, never for a primary.
export const buttonSizes: Record<Size, string> = {
  sm: "h-9 px-3.5",
  md: "h-11 px-5",
  // ★ Inside the scope `lg` is 52 px AT LEAST, not exactly. A call to action carries a label
  // in the display face and sometimes a chip beside it, and at 326 px the two do not always
  // fit one line: a fixed height cut the second line at the pill's edge (the lead's review of
  // `session-cta`, wave 15). A one-line label is 52 px, as before.
  lg: "h-12 px-7 pg:h-auto pg:min-h-13 pg:py-2",
};

// The press. A control with a hard shadow beneath it, which it sinks onto.
const pressAccent = "pg:shadow-press pg:active:translate-y-[3px] pg:active:shadow-press-down";
const pressSignal = "pg:shadow-press-signal pg:active:translate-y-[3px] pg:active:shadow-press-signal-down";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary: `btn-sheen bg-[var(--btn-bg)] text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] active:bg-[var(--btn-bg-active)] pg:font-display pg:font-extrabold ${pressAccent}`,
  secondary:
    "border border-[var(--btn2-border)] text-[var(--btn2-fg)] hover:border-[var(--btn2-border-hover)] hover:bg-[var(--btn2-bg-hover)] active:border-[var(--btn2-border-hover)] active:bg-[var(--btn2-bg-hover)] pg:border-2 pg:font-display pg:font-extrabold",
  // No border and no fill: a tertiary action that reads as text until hovered.
  ghost: "text-fg-heading hover:bg-[var(--btn2-bg-hover)] active:bg-[var(--btn2-bg-hover)]",
  // Destructive, and an OUTLINE rather than a filled red block: the
  // confirmation dialog carries the weight (REQ-UIX-013), and a console full of
  // red buttons teaches a member to stop reading red.
  // ★ Inside a dark scope the light error constants fail (2.67:1 on the
  // surface), so the on-dark ones are added; they are the platform's, not the
  // playground's (DEC-073, DEC-186 §3).
  danger:
    "border border-error-border text-error hover:bg-error-bg active:bg-error-bg pg-dark:border-error-on-dark pg-dark:text-error-on-dark pg-dark:hover:bg-raised pg-dark:active:bg-raised",
  // ── wave 15: two variants the playground names (`04-components.md`) ──
  // `signal` is the check-in: coral, and nothing else may borrow it. Outside
  // the scope it falls back to the platform's `live` colour with white on it.
  signal: `bg-signal text-on-signal font-semibold pg:font-display pg:font-extrabold ${pressSignal}`,
  // `quiet` is a filled tertiary: a raised step, no border, the body face.
  quiet: "bg-raised text-fg-heading font-semibold hover:bg-hover active:bg-hover",
};

const disabledClass =
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[var(--btn-bg)] aria-busy:cursor-progress";

// The display face is set at its own size, and only where a label is set in
// it: a primary, a secondary and the check-in, at the CTA's height.
const DISPLAY_LABEL: ReadonlySet<ButtonVariant> = new Set(["primary", "secondary", "signal"]);

// With a trailing slot, inside the scope: the label at the start, the slot at the end.
const SPLIT = "pg:justify-between pg:text-start";

export function buttonClass(variant: ButtonVariant = "primary", size: Size = "lg", extra = "") {
  const label = size === "lg" && DISPLAY_LABEL.has(variant) ? "pg:text-play-sm" : "";
  return `${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${label} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "lg",
  pending,
  pendingLabel,
  iconStart,
  iconEnd,
  trailing,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${buttonClass(variant, size)} ${disabledClass} ${trailing ? SPLIT : ""} ${className}`}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      {...props}
    >
      {pending ? (
        <SpinnerIcon label={pendingLabel ?? ""} aria-hidden={pendingLabel ? undefined : true} />
      ) : (
        iconStart
      )}
      <span>{children}</span>
      {pending ? null : iconEnd}
      {trailing}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "lg",
  trailing,
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: Size; trailing?: ReactNode }) {
  return (
    <Link className={`${buttonClass(variant, size)} ${trailing ? SPLIT : ""} ${className}`} {...props}>
      {children}
      {trailing}
    </Link>
  );
}
