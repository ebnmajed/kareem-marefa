"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLinkStatus } from "next/link";
import type { RouteProgressProps } from "@/components/ui";
import { usePendingNudge } from "@/components/ui/pending-nudge";

// Layer 1 of the loading model — `16` §7.1.1, REQ-UIX-006.
//
// ★ ONE BAR IN THE SHELL CANNOT BE DRIVEN BY `useLinkStatus()` DIRECTLY. The
// hook reports the status of its OWN enclosing `<Link>` and «must be used
// within a descendant component of a Link» (`use-link-status.md`), so a bar
// that lives outside every link has nothing to call it on. What is built
// instead, in two halves that share this module:
//
//   · `LinkPendingReporter` sits INSIDE every `ui/link`. It reads its own
//     link's status, draws the small inline affordance the docs describe, and
//     counts itself into a module-level store while it is pending.
//   · `RouteProgress` sits once in the shell, subscribes to that store, and
//     shows a bar only once a navigation has been pending for MORE THAN
//     `delayMs` (150). Below that a bar is a flash of noise — and with a
//     `loading.tsx` at every boundary, most navigations never reach it.
//
// Layer 2, the route skeletons, is the primary mechanism; this bar exists for
// the slow-network case where prefetch has not finished.
//
// ★ No `globals.css` keyframe: the bar grows through the Web Animations API,
// transform only (REQ-UIX-020), and under `prefers-reduced-motion` it is a
// still bar — present, so the member still sees that something is happening,
// but not moving.

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
  // A navigation is a transition too, and loses its retry the same way (`DEC-135`).
  usePendingNudge(pending);

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

export function RouteProgress({ delayMs = 150 }: RouteProgressProps) {
  const count = useSyncExternalStore(subscribe, pendingLinkCount, () => 0);
  const active = count > 0;
  // Set only from the timer and from cleanup, never synchronously in the effect
  // body: visibility is DERIVED — pending AND past the threshold.
  const [elapsed, setElapsed] = useState(false);
  const visible = active && elapsed;
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);

  useEffect(() => {
    const el = bar.current;
    if (!visible || !el) return;
    // `transform-origin` has no logical form, so the bar grows from the
    // inline START it reads off its own computed direction — right in Arabic.
    el.style.transformOrigin = getComputedStyle(el).direction === "rtl" ? "100% 50%" : "0% 50%";
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || typeof el.animate !== "function") return;
    const animation = el.animate([{ transform: "scaleX(0.08)" }, { transform: "scaleX(0.92)" }], {
      duration: 6000,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      fill: "forwards",
    });
    return () => animation.cancel();
  }, [visible]);

  if (!visible) return null;
  return (
    <div aria-hidden data-route-progress="" className="pointer-events-none fixed start-0 end-0 top-0 z-50 h-0.5">
      <div ref={bar} className="h-full bg-navy-950" style={{ transform: "scaleX(0.45)" }} />
    </div>
  );
}
