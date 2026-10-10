import { prefersReducedMotion } from "./reduced-motion";
import { parseCssTime } from "./duration";
import { isStillPath } from "./nav-motion";

// The poster's flight — wave 29 (DEC-280 §5, REQ-UIX-122, TRN-02).
//
// ★ Why not React's shared element alone: Next 16 keeps the route it leaves alive and hidden rather than removing it,
// so the card's poster never «exits» and React's `share` pair cannot form from the card to the event (measured on a
// production build, `wave29-lead-moves`). The flight is therefore a FLIP on the real element: the card's rectangle is
// remembered on press, and the poster that lands — the skeleton's, or the card's on the way back — is moved from that
// rectangle into its own place by `transform` alone (REQ-UIX-020). It plays inside the page's own transition, whose new
// side is live, so the sink and the flight are one move.
//
// Nothing moves under reduced motion, in the console, without a rectangle or without the API.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function boxOf(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Moves `el` from `from` into its own place. Arrival overshoots (`--ease-pop`, `--dur-play`); a return settles
 * (`--ease-out`, `--dur-slow`). Returns the animation, or null when nothing moved.
 */
export function flyFrom(el: HTMLElement | null, from: Box | null, arriving: boolean): Animation | null {
  if (!el || !from || typeof el.animate !== "function" || prefersReducedMotion() || isStillPath(location.pathname)) return null;
  const to = boxOf(el);
  if (!to) return null;
  const duration = parseCssTime(token(arriving ? "--dur-play" : "--dur-slow"));
  if (duration === 0) return null;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  return el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: "0 0" },
      { transform: "none", transformOrigin: "0 0" },
    ],
    { duration, easing: token(arriving ? "--ease-pop" : "--ease-out") || "ease-out" },
  );
}
