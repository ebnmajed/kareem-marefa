import { prefersReducedMotion } from "./reduced-motion";
import { parseCssTime } from "./duration";
import { isStillPath } from "./nav-motion";

// The story zoom — wave 29 (DEC-280 §5, REQ-UIX-123, TRN-03), Instagram's: the viewer opens as a circle the size of
// the ring that was tapped, growing out of it until it fills the screen and settling with the overshoot, while the
// page leans into the ring and darkens; every close shrinks it back into the same ring on `--ease-out`.
//
// `element.animate()`, no library. The timings are the tokens (`--dur-play`, `--dur-slow`, `--ease-pop`,
// `--ease-out`), read at the moment of the move. Under reduced motion, in the console, without a ring to come from
// or without the API, nothing animates and the caller opens or closes at once — the static state is the design.
//
// ★ `border-radius` is animated here, on the viewer's own composited layer — one of the two documented exceptions to
// «transform, opacity and filter only» (REQ-UIX-130); `ui-lint`'s keyframes rule names it.

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function canMove(el: HTMLElement | null, ring: Element | null | undefined): el is HTMLElement {
  return (
    el !== null &&
    ring instanceof Element &&
    ring.isConnected &&
    typeof el.animate === "function" &&
    !prefersReducedMotion() &&
    !isStillPath(location.pathname)
  );
}

/** The transform that puts the full-screen viewer exactly over the ring. */
function overRing(ring: Element): string | null {
  const r = ring.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dx = r.left + r.width / 2 - vw / 2;
  const dy = r.top + r.height / 2 - vh / 2;
  return `translate(${dx}px, ${dy}px) scale(${r.width / vw}, ${r.height / vh})`;
}

function lean(ring: Element, reverse: boolean, duration: number, easing: string): void {
  const main = document.getElementById("main");
  if (!main) return;
  const r = ring.getBoundingClientRect();
  const m = main.getBoundingClientRect();
  const origin = `${r.left + r.width / 2 - m.left}px ${r.top + r.height / 2 - m.top}px`;
  const leaned = { transform: "scale(1.08)", filter: "brightness(0.5)", transformOrigin: origin };
  const rest = { transform: "none", filter: "none", transformOrigin: origin };
  // No fill: when it ends the page is exactly as it was — the viewer covers it meanwhile.
  main.animate(reverse ? [leaned, rest] : [rest, leaned], { duration, easing });
}

/** Grows the viewer out of the ring. Returns the animation, or null when nothing moved. */
export function zoomOpen(viewer: HTMLElement | null, ring: Element | null | undefined): Animation | null {
  if (!canMove(viewer, ring)) return null;
  const from = overRing(ring as Element);
  if (!from) return null;
  const duration = parseCssTime(token("--dur-play"));
  if (duration === 0) return null;
  lean(ring as Element, false, duration, token("--ease-out") || "ease-out");
  return viewer.animate(
    // ui-lint-keyframes: the story portal's corner, the transitions spec's named exception — its own composited layer
    [
      { transform: from, borderRadius: "50%", transformOrigin: "50% 50%" },
      { transform: "none", borderRadius: "0", transformOrigin: "50% 50%" },
    ],
    { duration, easing: token("--ease-pop") || "ease-out" },
  );
}

/** Shrinks the viewer back into the ring. Resolve the close on its `finished`; null means close at once. */
export function zoomShut(viewer: HTMLElement | null, ring: Element | null | undefined): Animation | null {
  if (!canMove(viewer, ring)) return null;
  const to = overRing(ring as Element);
  if (!to) return null;
  const duration = parseCssTime(token("--dur-slow"));
  if (duration === 0) return null;
  const easing = token("--ease-out") || "ease-out";
  lean(ring as Element, true, duration, easing);
  return viewer.animate(
    // ui-lint-keyframes: the story portal's corner, the transitions spec's named exception — its own composited layer
    [
      { transform: "none", borderRadius: "0", transformOrigin: "50% 50%" },
      { transform: to, borderRadius: "50%", transformOrigin: "50% 50%" },
    ],
    // Held at the ring until the dialog unmounts, so it never flashes back to full screen.
    { duration, easing, fill: "forwards" },
  );
}
