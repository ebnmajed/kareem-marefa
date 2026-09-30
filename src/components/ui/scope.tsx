import type { ReactNode } from "react";
import { balooBhaijaan } from "@/lib/fonts";
import { PlayPortalProvider } from "@/components/ui/scope-portal";

// «ساحة اللعب» — the playground's scope. DEC-183 §4.2, DEC-186 §2, REQ-UIX-028.
//
// ★ THE ONLY PLACE THE SCOPE'S CLASS IS WRITTEN. Everything inside takes the
// playground's look; everything outside renders as it did before the scope
// existed. A screen enters the playground by being wrapped in this, and in no
// other way — so «which screens are in the scope» is a search for one name.
//
// It carries three things a class string alone cannot:
//   · the display face's variable. `next/font` scopes a face to the element
//     that carries its class, so the face is asked for only under a scope.
//   · the rule that scopes do not nest. A light island inside a dark scope is
//     a second component, not a prop on a child.
//   · the landing place for a portal (DEC-188). A dialog, a sheet and a menu
//     render into `<body>`, which is outside the scope; `ui/scope-portal` gives
//     them an element inside it.
//
// ★★ WAVE 17 (DEC-199 §1.3, REQ-UIX-049): THE SCOPE IS THE ROOT OF EVERYTHING
// THAT IS NOT THE PUBLIC SITE. It is rendered once, by a LAYOUT — the shell,
// `(auth)`, `legal`, `s`, `verify` — with `root`, and by nothing else: no screen
// and no component wraps itself any more, because scopes do not nest. The gallery
// alone renders it twice, side by side, to show both grounds.
// `tests/unit/scope-root.test.ts` holds who may render it, and
// `tests/unit/public-graph.test.ts` that no file the public site imports names it.
//
// `root` marks the element (`data-play-root`), and `globals.css` paints the
// document's own ground to match while one is on the page: `<body>` is outside
// every layout, and a phone shows it on overscroll.
//
// ★ The root scope's element is never transformed, filtered or clipped (DEC-188
// §5): it holds the landing place for every dialog, sheet and menu under it.

export interface PlayScopeProps {
  /** The light variant — supported, not the direction's default. */
  light?: boolean;
  /** A layout's scope: the whole surface. Marks the element so the document's ground follows it. */
  root?: boolean;
  className?: string;
  children: ReactNode;
}

export function PlayScope({ light = false, root = false, className = "", children }: PlayScopeProps) {
  return (
    <div data-play-root={root ? "" : undefined} className={`theme-play ${light ? "theme-play-light" : ""} ${balooBhaijaan.variable} ${className}`}>
      <PlayPortalProvider>{children}</PlayPortalProvider>
    </div>
  );
}
