import { prefersReducedMotion } from "./reduced-motion";

// The duration tokens, read as milliseconds for `element.animate()` and
// `requestAnimationFrame` (REQ-UIX-014, DEC-195 contract 1).
//
// A duration is never a literal in a moment: `globals.css` owns the ramp
// (`--duration-fast` / `-base` / `-slow` / `-party`, DEC-183 §4.3) and
// collapses it under reduced motion, and this reads what the page resolved.
// ★ A token that cannot be read gives 0, not a fallback number: a moment whose
// stylesheet did not load renders its static state rather than a duration
// nobody chose.

export type DurationToken = "fast" | "base" | "slow" | "party";

export type EasingToken = "play" | "play-in";

/** Parses a CSS time — `420ms`, `.42s`, `0.42s` — to milliseconds; anything else is 0. */
export function parseCssTime(value: string): number {
  const m = /^\s*(-?\d*\.?\d+)\s*(ms|s)\s*$/i.exec(value);
  if (!m) return 0;
  const n = Number(m[1]) * (m[2].toLowerCase() === "s" ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function rootValue(name: string, from?: Element): string {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return "";
  const el = from ?? document.documentElement;
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** A `--duration-*` token in milliseconds — 0 under reduced motion or when it cannot be read. */
export function readDuration(token: DurationToken, from?: Element): number {
  if (prefersReducedMotion()) return 0;
  return parseCssTime(rootValue(`--duration-${token}`, from));
}

/** An `--ease-*` token as a timing function, or `linear` when it cannot be read. */
export function readEasing(token: EasingToken, from?: Element): string {
  return rootValue(`--ease-${token}`, from) || "linear";
}
