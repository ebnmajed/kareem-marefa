"use client";

/// <reference types="react/canary" />
import * as React from "react";
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { installNavMotion, isStillPath, landReturningPoster, riseOnBack, settleNavKind } from "@/lib/ui/nav-motion";

// The page's one transition boundary — wave 29 (DEC-280 §5 – §6, REQ-UIX-121 … REQ-UIX-130).
//
// ★ An UPDATE boundary, not one keyed by the path: a key would remount every layout below the shell on every
// navigation and lose its state. React snapshots this boundary before and after any transition that changes what is
// inside it; the class `route` is what the CSS addresses, and `<html data-nav>` decides whether — and how — it moves.
// A transition with no kind (a form's redirect, a refresh) is cut by the CSS, so this never adds a move by itself.
//
// ★ The console and the platform get no boundary at all (`update="none"`), and the tree's shape never changes
// between the two, so crossing into the console remounts nothing (REQ-UIX-053, REQ-UIX-129).
// Absent in the plain 19.2 build the component tests run on: then there is no boundary, and nothing moves.
const ViewTransition = (React as { ViewTransition?: typeof React.ViewTransition }).ViewTransition;

export function RouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const still = isStillPath(pathname);

  useEffect(() => installNavMotion(), []);
  // ★ The staff tree marks the document still, so the sheet's and the dialog's landing — CSS keyed off this mark —
  // never plays there (REQ-UIX-053); neither primitive declares an animation of its own.
  useEffect(() => {
    if (still) document.documentElement.dataset.still = "";
    else delete document.documentElement.dataset.still;
  }, [still]);
  // The navigation has committed: a card whose event was left by back flies home (before paint, inside the page's
  // transition); the move plays; then the kind is cleared so nothing later inherits it.
  useLayoutEffect(() => {
    riseOnBack();
    landReturningPoster();
  }, [pathname]);
  useEffect(() => settleNavKind(), [pathname]);

  if (!ViewTransition) return <>{children}</>;
  return (
    <ViewTransition update={still ? "none" : "route"} enter="none" exit="none" default="none">
      {children}
    </ViewTransition>
  );
}
