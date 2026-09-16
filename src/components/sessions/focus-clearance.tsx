"use client";

import { useEffect } from "react";

// Keeps the focused control out from under the sticky header, the sticky
// sub-nav and the fixed action bar — `SC 2.4.11` Focus Not Obscured,
// REQ-UIX-017, `16` §3.1.
//
// ★ SCROLL PADDING IS NOT ENOUGH ON ITS OWN, and the real build proved it.
// `globals.css` gives `html` a `scroll-padding` equal to the layers above and
// below, and an anchor jump honours it. Sequential focus navigation in
// Chromium does not: tabbing to a control that is inside the viewport but
// behind the phone's bottom action bar leaves it there, and tabbing back to the
// top of a scrolled page lands the breadcrumb under the header.
//
// So on every `focusin` this looks at what actually PAINTS over the focused
// control — `elementFromPoint`, so a layer that merely overlaps but sits
// underneath (the skip link over the header) is not a cover — and scrolls by
// exactly the covered distance plus a small gap. It measures the layers rather
// than reading the scroll-padding tokens, so it holds even where a stylesheet
// has not applied.
//
// It renders nothing, and it does nothing when the control is already clear.

const GAP = 8;

function coverOf(el: HTMLElement): { above: number; below: number } | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  let above = 0;
  let below = window.innerHeight;
  let covered = false;
  const xs = [r.left + r.width / 2, r.left + 4, r.right - 4];
  const ys = [r.top + 2, r.top + r.height / 2, r.bottom - 2];
  for (const x of xs) {
    for (const y of ys) {
      if (y < 0 || y >= window.innerHeight) continue;
      const painted = document.elementFromPoint(x, y);
      if (!painted || el.contains(painted)) continue;
      for (let n: Element | null = painted; n; n = n.parentElement) {
        const position = getComputedStyle(n).position;
        if (position !== "fixed" && position !== "sticky") continue;
        if (n.contains(el)) break; // a control inside the layer is not covered by it
        const layer = n.getBoundingClientRect();
        covered = true;
        // A layer whose middle is above the control's middle covers it from above.
        if (layer.top + layer.height / 2 < r.top + r.height / 2) above = Math.max(above, layer.bottom);
        else below = Math.min(below, layer.top);
        break;
      }
    }
  }
  return covered ? { above, below } : null;
}

export function FocusClearance() {
  useEffect(() => {
    function clear(el: HTMLElement) {
      if (document.activeElement !== el) return;
      const cover = coverOf(el);
      if (!cover) return;
      const r = el.getBoundingClientRect();
      // `instant`, over `globals.css`'s smooth scrolling: a focus ring that
      // glides out from behind a bar is behind the bar while it glides.
      if (r.top < cover.above + GAP) window.scrollBy({ top: r.top - cover.above - GAP, behavior: "instant" });
      else if (r.bottom > cover.below - GAP) window.scrollBy({ top: r.bottom - cover.below + GAP, behavior: "instant" });
    }

    let settle: ReturnType<typeof setTimeout> | undefined;
    function onFocusIn(event: FocusEvent) {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === document.body) return;
      // Once on the next frame, for a focus that did not scroll…
      requestAnimationFrame(() => clear(el));
      // …and once more after the browser's own focus scroll has FINISHED.
      // Under `scroll-behavior: smooth` that scroll animates, so a check on the
      // next frame measures a page still moving and can leave the control
      // under the header when the glide ends. `scrollend` where there is one,
      // a short timer where there is not.
      clearTimeout(settle);
      const after = () => {
        clearTimeout(settle);
        window.removeEventListener("scrollend", after);
        clear(el);
      };
      window.addEventListener("scrollend", after, { once: true });
      settle = setTimeout(after, 450);
    }
    document.addEventListener("focusin", onFocusIn);
    return () => {
      clearTimeout(settle);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);
  return null;
}
