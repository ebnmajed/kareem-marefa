import { useSyncExternalStore } from "react";

// Reduced motion, read once, the same way by every moment (REQ-UIX-014,
// REQ-UIX-044, DEC-195 §2.3).
//
// ★ Collapsing a duration is not a reduced-motion design. `globals.css`
// collapses the `--duration-*` tokens to 0 ms under the media query, which
// keeps a stray transition from moving; a moment ALSO asks this module and,
// when it answers true, renders its named static state and never starts —
// so the static state is a thing that was designed, not the last frame of an
// animation that ran in zero time.

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the member has asked for reduced motion — or when there is no window to ask. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * The hook form. ★ The server's answer is `true`: what the server renders is
 * the static state, so a page that has not hydrated never shows the first
 * frame of a moment it cannot play.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => true);
}
