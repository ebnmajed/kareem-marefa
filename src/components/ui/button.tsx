import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";

const base =
  "inline-flex h-12 items-center justify-center rounded-field px-7 text-label transition-colors duration-150";

const variants = {
  primary:
    "btn-sheen bg-[var(--btn-bg)] text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] active:bg-[var(--btn-bg-active)]",
  secondary:
    "border border-[var(--btn2-border)] text-[var(--btn2-fg)] hover:border-[var(--btn2-border-hover)] hover:bg-[var(--btn2-bg-hover)]",
} as const;

type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      className={`${base} ${variants[variant]} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[var(--btn-bg)] ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
