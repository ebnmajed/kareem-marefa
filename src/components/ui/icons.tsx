import type { ComponentProps } from "react";

// The permitted glyph set, as inline SVGs (DEC-019, 04 §11). Brand policy
// bans icon libraries; these eight are the whole vocabulary — dots, lines,
// chevron, arrow, check, spinner, close, plus. Anything else is a design
// decision, not an import.
//
// Every glyph is decorative by default (`aria-hidden`); a glyph that carries
// meaning on its own takes a `label`, which becomes an accessible name. Size
// follows the text (`1em`), colour follows `currentColor`.
//
// Direction: chevrons and arrows point "forward" or "back" in READING order
// and mirror in RTL (10 §2.4). Checkmarks, dots, lines, the spinner, close
// and plus never mirror. The `rtl:` variant adds no specificity (10 §2.3), so
// the mirror is the only transform these components apply.

type IconProps = Omit<ComponentProps<"svg">, "children"> & {
  /** Accessible name. Omit for a purely decorative glyph. */
  label?: string;
};

function Svg({ label, className = "", ...props }: ComponentProps<"svg"> & { label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={`inline-block shrink-0 ${className}`}
      {...props}
    />
  );
}

/** A filled dot — status, bullets, the constellation's nodes. Never mirrors. */
export function DotIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** A hairline — separators, the chapter spine. Never mirrors. */
export function LineIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="4" y1="12" x2="20" y2="12" />
    </Svg>
  );
}

type Direction = "forward" | "back" | "down" | "up";

// In LTR "forward" points right. In RTL the reader moves left, so the same
// glyph mirrors. Up and down are the same in both.
const pointing: Record<Direction, { path: string; mirrors: boolean }> = {
  forward: { path: "m9 6 6 6-6 6", mirrors: true },
  back: { path: "m15 6-6 6 6 6", mirrors: true },
  down: { path: "m6 9 6 6 6-6", mirrors: false },
  up: { path: "m6 15 6-6 6 6", mirrors: false },
};

/** Disclosure and navigation. Mirrors in RTL when pointing forward/back. */
export function ChevronIcon({ direction = "forward", className = "", ...props }: IconProps & { direction?: Direction }) {
  const p = pointing[direction];
  return (
    <Svg data-direction={direction} className={`${p.mirrors ? "rtl:-scale-x-100" : ""} ${className}`} {...props}>
      <path d={p.path} />
    </Svg>
  );
}

const arrows: Record<Direction, { path: string; mirrors: boolean }> = {
  forward: { path: "M4 12h16m-6-6 6 6-6 6", mirrors: true },
  back: { path: "M20 12H4m6-6-6 6 6 6", mirrors: true },
  down: { path: "M12 4v16m-6-6 6 6 6-6", mirrors: false },
  up: { path: "M12 20V4m-6 6 6-6 6 6", mirrors: false },
};

/** Links that go somewhere. Mirrors in RTL when pointing forward/back. */
export function ArrowIcon({ direction = "forward", className = "", ...props }: IconProps & { direction?: Direction }) {
  const p = arrows[direction];
  return (
    <Svg data-direction={direction} className={`${p.mirrors ? "rtl:-scale-x-100" : ""} ${className}`} {...props}>
      <path d={p.path} />
    </Svg>
  );
}

/** Done, selected, present. Never mirrors (10 §2.4). */
export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12 5 5 9-10" />
    </Svg>
  );
}

/**
 * Busy. Takes a `label` in the current language and exposes it as a live
 * status, because a spinner with no text is a spinner nobody can hear.
 */
export function SpinnerIcon({ label, className = "", ...props }: IconProps & { label: string }) {
  return (
    <Svg label={label} role="status" aria-live="polite" className={`motion-safe:animate-spin ${className}`} {...props}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Svg>
  );
}

/** Dismiss. Never mirrors. */
export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

/** Add. Never mirrors. */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}
