import { useEffect, useState } from "react";
import { formatNumber } from "@/components/sessions/numerals";
import { readDuration, type DurationToken } from "./duration";
import { prefersReducedMotion } from "./reduced-motion";

// The count-up — moment 3's balance (03-motion.md §3, REQ-UIX-044).
//
// It writes TEXT, through the repository's numeral formatter, so the figure is
// Western digits at every frame (DEC-124) and a screen reader reads a number,
// not a transform. Cubic ease-out, `requestAnimationFrame`.
//
// ★ It plays only when `play` is true — which is the once-per-occurrence
// keying's answer (`moment.ts`), never a render's. Not playing, it shows `to`:
// the static state is the new figure. Under reduced motion it shows `to` at
// once. A duration is a token, never a number (REQ-UIX-014).

export type CountUpOptions = {
  from: number;
  to: number;
  duration: DurationToken;
  /** The moment's answer: true only on the occurrence's first sight. */
  play: boolean;
  /** Called once the figure reaches `to` by counting — not when it starts there. */
  onDone?: () => void;
  format?: (value: number) => string;
};

export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/** The figure to show now: `from` counting to `to` while playing, `to` otherwise. */
export function useCountUp({ from, to, duration, play, onDone, format = formatNumber }: CountUpOptions): string {
  // A run is named by its inputs, so a frame written for an old run is never
  // shown for a new one.
  const run = `${from}>${to}>${duration}`;
  const [frame, setFrame] = useState<{ run: string; value: number } | null>(null);
  // Nothing to count: not this occurrence's first sight, no distance, or no
  // duration (reduced motion collapses the token to 0 — readDuration says so).
  const instant = !play || from === to || prefersReducedMotion() || readDuration(duration) === 0;

  useEffect(() => {
    if (!play) return;
    if (instant) {
      onDone?.();
      return;
    }
    const total = readDuration(duration);
    let id = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = (now - start) / total;
      if (t >= 1) {
        setFrame({ run, value: to });
        onDone?.();
        return;
      }
      setFrame({ run, value: Math.round(from + (to - from) * easeOutCubic(t)) });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
    // `onDone` is a notification, not an input: a new function identity on a
    // re-render must not restart the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, play, instant]);

  if (instant) return format(to);
  return format(frame?.run === run ? frame.value : from);
}
