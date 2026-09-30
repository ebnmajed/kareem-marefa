"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Where a scoped primitive's portal lands — DEC-188, REQ-UIX-028, REQ-UIX-030.
//
// ★ A DIALOG, A SHEET AND A MENU RENDER THROUGH A PORTAL INTO `<body>`, AND
// `<body>` IS OUTSIDE THE SCOPE. Opened from a scoped screen they would wear
// none of it: not the scope's variables, not one `pg:` class. Nothing in the
// four plans caught this, and the gallery could not — a closed dialog renders
// nothing to capture.
//
// So the scope carries its own landing place: an empty element INSIDE the
// scope's element, handed down by context. A primitive that portals asks for
// it and gives it to Radix as `container`.
//
// ★ OUTSIDE A SCOPE THE HOOK RETURNS `undefined`, which is Radix's default —
// `<body>`, exactly as before the wave. No existing screen changes.
//
// The landing place is `display: contents` and its children are `fixed`, so it
// takes no room in the scope's own layout.

const PlayPortalContext = createContext<HTMLElement | null>(null);

export function PlayPortalProvider({ children }: { children: ReactNode }) {
  // State, not a ref: the primitives must re-render once the element exists.
  const [landing, setLanding] = useState<HTMLElement | null>(null);
  return (
    <PlayPortalContext.Provider value={landing}>
      {children}
      <div ref={setLanding} data-play-portal="" className="contents" />
    </PlayPortalContext.Provider>
  );
}

/** The scope's landing place for a portal, or `undefined` outside a scope — Radix's own default. */
export function usePlayPortal(): HTMLElement | undefined {
  return useContext(PlayPortalContext) ?? undefined;
}
