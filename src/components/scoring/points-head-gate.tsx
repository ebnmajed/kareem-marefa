"use client";

import { useRef } from "react";
import { MomentPointsHead, type MomentPointsHeadProps } from "@/components/scoring/moment-points-head";
import { useDisplayed } from "@/components/scoring/use-displayed";

// SCR-022's head behind the displayed-copy gate (wave 20, DEC-218 §3.7). scoring's file.
//
// On a phone the head is the page's; from `lg` the hub's band carries the balance and the head is `lg:hidden` — but
// still in the document, holding the same moment 3 occurrence the band holds. A copy that is not displayed must
// claim nothing and acknowledge nothing (`use-displayed.ts`), or the hidden head would take the moment from the band
// the member is looking at. So until this copy has a box it renders the STATIC head — no occurrence, nothing to
// acknowledge — and once it has one it mounts the moment, exactly as `MomentWeek` does for the week.

export function PointsHeadGate(props: MomentPointsHeadProps) {
  const root = useRef<HTMLDivElement>(null);
  const displayed = useDisplayed(root);
  return (
    <div ref={root} data-moment-copy={displayed ? "displayed" : "hidden"}>
      {displayed ? (
        <MomentPointsHead key="live" {...props} />
      ) : (
        <MomentPointsHead key="static" {...props} completion={null} levelUp={null} needsMark={false} />
      )}
    </div>
  );
}
