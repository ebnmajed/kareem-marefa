"use client";

import { useRef, type ReactNode } from "react";
import { useDisplayed } from "@/components/scoring/use-displayed";

// Renders its children only in the copy that is DISPLAYED (wave 20, DEC-218 §3.7). scoring's file.
//
// On `/app/me` both forms of the standing are in the document at every width — the card `lg:hidden`, the band
// `hidden lg:block`. Moment 3's «+N» is a node a spec counts (`[data-slot=delta]`), and a count meets hidden elements
// too, so the copy that is not displayed must not merely hide the node: it must not render it. This marker has a box
// only where its copy is shown; until it has one, nothing is rendered beside it. The server renders nothing here
// (it does not know the viewport): the «+N» arrives with hydration, in the displayed copy alone.

export function DisplayedOnly({ children }: { children: ReactNode }) {
  const root = useRef<HTMLSpanElement>(null);
  const displayed = useDisplayed(root);
  return (
    <span ref={root} data-displayed-only={displayed ? "shown" : "pending"} className="inline">
      {displayed ? children : null}
    </span>
  );
}
