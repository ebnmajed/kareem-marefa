"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { takeHandedPoster } from "@/lib/ui/nav-motion";
import { flyFrom } from "@/lib/ui/poster-flight";

// Where the jump lands on the event page itself — wave 29 (DEC-280 §5, REQ-UIX-122).
//
// The jump lands on whichever arrives first: the skeleton's poster (`pending-poster.tsx`) when the page is slow, or
// this — the hero — when the page commits at once (measured: a fast server never shows the skeleton). The handoff is
// taken once, so the poster flies once, whichever caught it. A visit by any other path finds nothing and moves nothing.
export function PosterLanding({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const handed = takeHandedPoster(sessionId);
    if (handed?.from) flyFrom(box.current, handed.from, true);
  }, [sessionId]);
  return <div ref={box}>{children}</div>;
}
