// DEC-284 — the next screen is fetched before the tap lands. `src/lib/ui/intent-prefetch.ts`.
//
// ★ The rule that matters most: an audited `/api/…` route is NEVER prefetched — a prefetch of a download route would be
// a download nobody asked for, with its audit row.
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetPrefetches, installIntentPrefetch, prefetchablePath, prefetchOnce } from "@/lib/ui/intent-prefetch";

afterEach(() => {
  forgetPrefetches();
  document.body.innerHTML = "";
});

function link(href: string, attrs = ""): HTMLAnchorElement {
  document.body.innerHTML = `<a id="a" href="${href}" ${attrs}><span id="in">x</span></a>`;
  return document.getElementById("a") as HTMLAnchorElement;
}

describe("prefetchablePath", () => {
  it("is the app's own pages under a locale, and the public card", () => {
    expect(prefetchablePath(link("/ar/app/sessions"), location.origin)).toBe("/ar/app/sessions");
    expect(prefetchablePath(link("/en/app"), location.origin)).toBe("/en/app");
    expect(prefetchablePath(link("/ar/app/me/settings?x=1"), location.origin)).toBe("/ar/app/me/settings?x=1");
    expect(prefetchablePath(link("/ar/s/11111111-1111-4111-8111-111111111111"), location.origin)).toBe("/ar/s/11111111-1111-4111-8111-111111111111");
  });

  it("★ never an /api route, another site, a download, or a new tab", () => {
    for (const a of [
      link("/api/photos/x/download"),
      link("/api/designer/downloads/y"),
      link("https://example.com/ar/app"),
      link("/ar/app/sessions", 'download=""'),
      link("/ar/app/sessions", 'target="_blank"'),
      link("/ar"),
      link("/ar/register"),
    ]) {
      expect(prefetchablePath(a, location.origin), a.outerHTML).toBeNull();
    }
  });
});

describe("prefetchOnce", () => {
  it("fetches a page once per freshness window, then again after it", () => {
    const fetch = vi.fn();
    expect(prefetchOnce("/ar/app", fetch, 1_000)).toBe(true);
    expect(prefetchOnce("/ar/app", fetch, 30_000)).toBe(false);
    expect(prefetchOnce("/ar/app", fetch, 62_000)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("installIntentPrefetch", () => {
  it("a press-down on a page link prefetches it; a touch hover does not, a mouse hover does", () => {
    const fetch = vi.fn();
    const off = installIntentPrefetch(fetch);
    link("/ar/app/leaderboards");
    const inner = document.getElementById("in")!;
    inner.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    expect(fetch).not.toHaveBeenCalled();
    inner.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    expect(fetch).toHaveBeenCalledWith("/ar/app/leaderboards");
    forgetPrefetches();
    inner.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(fetch).toHaveBeenCalledTimes(2);
    off();
  });

  it("★ a press on an /api link prefetches nothing", () => {
    const fetch = vi.fn();
    const off = installIntentPrefetch(fetch);
    link("/api/photos/x/download");
    document.getElementById("in")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    expect(fetch).not.toHaveBeenCalled();
    off();
  });
});
