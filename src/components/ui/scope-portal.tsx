"use client";

import { createContext, useContext, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";

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

// ★★ WAVE 17 (DEC-201): THE PROVIDER NEVER RE-RENDERS, AND THAT IS NOT A DETAIL.
// Until wave 17 it held the landing element in STATE, set from a ref callback at
// mount, and published it by context. Around a card that cost nothing. At the
// ROOT of the shell it is a context change above every streamed `<Suspense>`
// boundary of every page, in the first frame of hydration — and React answers a
// context change above a boundary it has not hydrated yet by CLIENT-RENDERING
// that boundary. Measured on a production build with the scope at the root: the
// server's streamed segment arrived ~300 ms later and sat hidden beside the
// client's copy — two `h1`s for sixteen frames — and every spec that read the
// page in that window met two of everything.
//
// So the context carries a REF, which never changes, and each CONSUMER reads it
// after it has mounted: one local re-render of a dialog, a sheet or a menu, and
// nothing above it moves. A portal is only mounted when its primitive is open,
// which is after that.
const PlayPortalContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function PlayPortalProvider({ children }: { children: ReactNode }) {
  const landing = useRef<HTMLDivElement | null>(null);
  return (
    <PlayPortalContext.Provider value={landing}>
      {children}
      <div ref={landing} data-play-portal="" className="contents" />
    </PlayPortalContext.Provider>
  );
}

const subscribe = () => () => {};

/** The scope's landing place for a portal, or `undefined` outside a scope — Radix's own default. */
export function usePlayPortal(): HTMLElement | undefined {
  const landing = useContext(PlayPortalContext);
  // The element exists only once the provider has committed, which is after this consumer's first
  // render. `useSyncExternalStore` reads it again after the commit — and after hydration, where the
  // server's answer is «none yet» — and re-renders THIS consumer alone if it changed.
  const element = useSyncExternalStore(
    subscribe,
    () => landing?.current ?? null,
    () => null,
  );
  return element ?? undefined;
}
