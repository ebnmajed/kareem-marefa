import { useSyncExternalStore } from "react";

// True only after hydration: the server snapshot is `false`, the client's `true` — and no effect, so nothing
// renders twice to learn it. A form that cannot submit before hydration reads it to hold its controls until then.

const subscribeNothing = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}
