"use client";

/// <reference types="react/canary" />
import * as React from "react";
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { forgetPendingKind, installNavMotion, isStillPath, noteNavigation } from "@/lib/ui/nav-motion";

// The page's one transition boundary — wave 29 (DEC-280 §5 – §6, REQ-UIX-121 … REQ-UIX-130).
//
// ★ An UPDATE boundary, not one keyed by the path: a key would remount every layout below the shell on every
// navigation and lose its state. React snapshots this boundary before and after any transition that changes what is
// inside it; the class `route` is what the CSS addresses, and the transition's TYPE — set by the link that was tapped
// (DEC-285) — decides the move. A transition with no type (a skeleton's page arriving, a refresh) crossfades.
//
// ★ The console and the platform get no boundary at all (`update="none"`), and the tree's shape never changes
// between the two, so crossing into the console remounts nothing (REQ-UIX-053, REQ-UIX-129).
// Absent in the plain 19.2 build the component tests run on: then there is no boundary, and nothing moves.
const ViewTransition = (React as { ViewTransition?: typeof React.ViewTransition }).ViewTransition;

export function RouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const still = isStillPath(pathname);

  useEffect(() => installNavMotion(), []);
  // Runs inside the navigation's view-transition update (React runs layout effects there): the signal that THIS
  // transition is the navigation, so it — and not the old page's pending dot — takes the tap's move.
  useLayoutEffect(() => noteNavigation(), [pathname]);
  // A navigation committed: the tap's move was taken by its transition — or there was none to take it. Either way it
  // must never reach a later one (a save's refresh, a stream).
  useEffect(() => forgetPendingKind(), [pathname]);
  // ★ The staff tree marks the document still, so the sheet's and the dialog's landing — CSS keyed off this mark —
  // never plays there (REQ-UIX-053); neither primitive declares an animation of its own.
  useEffect(() => {
    if (still) document.documentElement.dataset.still = "";
    else delete document.documentElement.dataset.still;
  }, [still]);

  if (!ViewTransition) return <>{children}</>;
  return (
    <ViewTransition update={still ? "none" : "route"} enter="none" exit="none" default="none">
      {children}
    </ViewTransition>
  );
}
