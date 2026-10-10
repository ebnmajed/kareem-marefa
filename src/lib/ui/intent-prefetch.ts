// Intent prefetch — the next screen is fetched before the tap lands (DEC-284).
//
// Next's default prefetch for a dynamic page stops at its `loading.tsx` skeleton, and every visit asks the server
// again (`staleTimes.dynamic` 0). So a tap waited a full server round trip before the next screen — and before any
// move could play. McMaster-Carr's practice, applied: the moment a pointer shows intent — a mouse resting on a link, a
// finger or a click pressing down — the FULL page is prefetched; and when the browser is idle, the tabs a member is
// most likely to open next are warmed. A prefetched page is reused for `staleTimes.static` (next.config.ts); a write
// still refreshes what it changed, because every action revalidates its own paths.
//
// ★ Only the app's own pages under a locale (`/ar/app/…`, `/en/app/…`, the public card `/ar/s/…`). NEVER `/api/…`:
// the audited download routes write a row per request, and a prefetch of one would be a download nobody asked for.

const PAGE = /^\/(?:ar|en)\/(?:app(?:\/|$)|s\/)/;

/** The same-origin page path a link points at, if it is one we may prefetch. */
export function prefetchablePath(a: HTMLAnchorElement, origin: string): string | null {
  if (a.target && a.target !== "_self") return null;
  if (a.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(a.href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || !PAGE.test(url.pathname)) return null;
  return url.pathname + url.search;
}

const recent = new Map<string, number>();
// Matches `staleTimes.static`: a page prefetched within it is still in the router's cache.
const FRESH_MS = 60_000;

/** Prefetch once per freshness window; returns whether a request was made. */
export function prefetchOnce(path: string, prefetch: (href: string) => void, now = Date.now()): boolean {
  const at = recent.get(path);
  if (at !== undefined && now - at < FRESH_MS) return false;
  recent.set(path, now);
  prefetch(path);
  return true;
}

export function forgetPrefetches(): void {
  recent.clear();
}

/**
 * Listens for intent across the whole shell. Returns the cleanup. `pointerover` with a mouse (a resting cursor is
 * intent), and `pointerdown` from anything (a finger or a click pressing down — about 100 ms before the click lands).
 */
export function installIntentPrefetch(prefetch: (href: string) => void): () => void {
  const onIntent = (event: PointerEvent) => {
    if (event.type === "pointerover" && event.pointerType !== "mouse") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const a = target.closest("a[href]");
    if (!(a instanceof HTMLAnchorElement)) return;
    const path = prefetchablePath(a, location.origin);
    if (path && path !== location.pathname + location.search) prefetchOnce(path, prefetch);
  };
  document.addEventListener("pointerover", onIntent, { passive: true });
  document.addEventListener("pointerdown", onIntent, { passive: true, capture: true });
  return () => {
    document.removeEventListener("pointerover", onIntent);
    document.removeEventListener("pointerdown", onIntent, { capture: true });
  };
}

/** Warms a few likely destinations when the browser is idle; returns the cleanup. */
export function warmWhenIdle(paths: readonly string[], prefetch: (href: string) => void): () => void {
  const run = () => {
    for (const path of paths) prefetchOnce(path, prefetch);
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 4000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 1500);
  return () => window.clearTimeout(id);
}
