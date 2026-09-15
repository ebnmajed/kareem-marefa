import { Link } from "@/i18n/navigation";
import type { ComponentProps } from "react";
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

export const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-field text-label transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

// 44 px is the floor (REQ-NFR-007); `md` and `lg` clear it, and `sm` is for
// dense console rows where the row itself is the target, never for a primary.
export const buttonSizes: Record<Size, string> = {
  sm: "h-9 px-3.5",
  md: "h-11 px-5",
  lg: "h-12 px-7",
};

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "btn-sheen bg-[var(--btn-bg)] text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] active:bg-[var(--btn-bg-active)]",
  secondary:
    "border border-[var(--btn2-border)] text-[var(--btn2-fg)] hover:border-[var(--btn2-border-hover)] hover:bg-[var(--btn2-bg-hover)] active:border-[var(--btn2-border-hover)] active:bg-[var(--btn2-bg-hover)]",
  // No border and no fill: a tertiary action that reads as text until hovered.
  ghost: "text-fg-heading hover:bg-[var(--btn2-bg-hover)] active:bg-[var(--btn2-bg-hover)]",
  // Destructive, and an OUTLINE rather than a filled red block: the
  // confirmation dialog carries the weight (REQ-UIX-013), and a console full of
  // red buttons teaches a member to stop reading red.
  danger: "border border-error-border text-error hover:bg-error-bg active:bg-error-bg",
};

const disabledClass =
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[var(--btn-bg)] aria-busy:cursor-progress";

export function buttonClass(variant: ButtonVariant = "primary", size: Size = "lg", extra = "") {
  return `${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "lg",
  pending,
  pendingLabel,
  iconStart,
  iconEnd,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${buttonClass(variant, size)} ${disabledClass} ${className}`}
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
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "lg",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: Size }) {
  return <Link className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}
