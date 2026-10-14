"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLinkStatus } from "next/link";

// The pending store — layer 1 of the loading model, `16` §7.1.1, REQ-UIX-006, as DEC-288 leaves it.
//
// ★ THERE IS NO BAR ANY MORE, AND NO SKELETON (DEC-288). The owner saw the skeleton and the navigation's move
// overlap, and asked for the waits the product already draws: while a navigation is pending, the link pressed shows
// its dot, and past 400 ms THE MARK BREATHES (`shell/home-mark.tsx`, `shell/route-wait.tsx`, the logo's `loading`
// move). The page then arrives whole, with the one move its link named (DEC-285).
//
// ★ `useLinkStatus()` reports the status of its OWN enclosing `<Link>` and «must be used within a descendant
// component of a Link» (`use-link-status.md`), so the mark, which lives outside every link, cannot call it. Two
// halves share this module:
//
//   · `LinkPendingReporter` sits INSIDE every `ui/link`. It reads its own link's status, draws the small inline
//     dot the docs describe, and counts itself into a module-level store while it is pending.
//   · `usePendingLongerThan(ms)` subscribes to that store: true once a navigation has been pending for MORE than
//     `ms`. Below that a signal is a flash of noise.

let pendingLinks = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

/** The number of links whose navigation is pending right now. Exported for the test. */
export function pendingLinkCount(): number {
  return pendingLinks;
}

/** Inside `ui/link` only. It must be a descendant of the link it reports on. */
export function LinkPendingReporter({ quiet = false }: { quiet?: boolean }) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    pendingLinks += 1;
    emit();
    return () => {
      pendingLinks -= 1;
      emit();
    };
  }, [pending]);

  if (quiet || !pending) return null;
  // A dot — the family's ancestor glyph (DEC-079) — in the link's own colour.
  return (
    <span
      aria-hidden
      data-link-pending=""
      className="ms-1.5 inline-block size-1.5 shrink-0 rounded-full bg-current align-middle opacity-60 motion-safe:animate-pulse"
    />
  );
}

/**
 * True once a navigation has been pending for MORE THAN `delayMs` — and false again the moment it lands.
 * The shell's mark breathes on it, past 400 ms (wave 26, REQ-UIX-119; DEC-288 made it the one wait signal).
 */
export function usePendingLongerThan(delayMs: number): boolean {
  const active = useSyncExternalStore(subscribe, pendingLinkCount, () => 0) > 0;
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);
  return active && elapsed;
}
