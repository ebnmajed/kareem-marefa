import type { ReactNode } from "react";
import { balooBhaijaan } from "@/lib/fonts";

// «ساحة اللعب» — the playground's scope. DEC-183 §4.2, DEC-186 §2, REQ-UIX-028.
//
// ★ THE ONLY PLACE THE SCOPE'S CLASS IS WRITTEN. Everything inside takes the
// playground's look; everything outside renders as it did before the scope
// existed. A screen enters the playground by being wrapped in this, and in no
// other way — so «which screens are in the scope» is a search for one name.
//
// It carries two things a class string alone cannot:
//   · the display face's variable. `next/font` scopes a face to the element
//     that carries its class, so the face is asked for only under a scope.
//   · the rule that scopes do not nest. A light island inside a dark scope is
//     a second component, not a prop on a child.
//
// ★ THIS WAVE ONLY THE GALLERY RENDERS IT. `tests/unit/public-graph.test.ts`
// fails if a file the public site imports ever names the scope.

export interface PlayScopeProps {
  /** The light variant — supported, not the direction's default. */
  light?: boolean;
  className?: string;
  children: ReactNode;
}

export function PlayScope({ light = false, className = "", children }: PlayScopeProps) {
  return (
    <div className={`theme-play ${light ? "theme-play-light" : ""} ${balooBhaijaan.variable} ${className}`}>
      {children}
    </div>
  );
}
