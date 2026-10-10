"use client";

import { useSyncExternalStore } from "react";

// From `lg` the sheet «صورتك» is the same body centred in `ui/dialog` (REQ-PRF-016, DEC-281). The server and the first
// paint assume the phone; the frame switches when the query answers. The shape `ui/story-viewer.tsx` uses.

const QUERY = "(min-width: 64rem)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useMinWidthLg(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches,
    () => false,
  );
}
