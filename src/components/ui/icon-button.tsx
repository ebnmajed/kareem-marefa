import type { IconButtonProps, Size } from "@/components/ui";
import { buttonBase, buttonVariants } from "@/components/ui/button";
import { SpinnerIcon } from "@/components/ui/icons";

// An icon-only button — `16` §4.2.1, REQ-NFR-007.
//
// ★ The name is mandatory, by type (`Labelled`): an icon-only control ships
// only where its meaning is unambiguous AND the name is on the element. The
// same label is the tooltip, so a sighted mouse user is not left guessing
// either.
//
// Square at the house sizes — `md` is 44 px, the house target (`h-11`); `sm`
// (36 px) is for dense desktop chrome and still clears WCAG 2.5.8's 24 px. It
// shares `ui/button`'s variants, so a ghost icon button and a ghost button are
// the same control. Pending swaps the glyph for the spinner and keeps the name.

const SQUARE: Record<Size, string> = {
  sm: "size-9 text-[1.125rem]",
  md: "size-11 text-[1.25rem]",
  lg: "size-12 text-[1.375rem]",
};

export function IconButton({
  label,
  children,
  variant = "ghost",
  size = "md",
  pending,
  disabled,
  type = "button",
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      className={`${buttonBase} ${SQUARE[size]} ${buttonVariants[variant]} disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...props}
    >
      {pending ? <SpinnerIcon label="" aria-hidden /> : children}
    </button>
  );
}
