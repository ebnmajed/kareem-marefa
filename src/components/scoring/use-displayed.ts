"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

// Which copy of a moment's surface is on screen (wave 18, DEC-207 §2). The server does not know the viewport, so a
// surface drawn for the phone and again for the desktop is in the HTML twice, one copy not displayed — and the first
// copy to mount would claim the occurrence, possibly the hidden one. A moment's controller mounts only in the copy
// this returns true for. Shared by the week (`moment-week.tsx`) and the event page's outcome card
// (`moment-completion.tsx`), so the two never disagree about what «displayed» means.
//
// ★ Watched, not measured once: a copy can be committed before its boundary shows it (the lead's gate at
// f7d0f4d7), so a copy with no box is observed until it has one. The copy hidden at this width never gets a box.

const useIsomorphicLayoutEffect = typeof window === "undefined" ? () => {} : useLayoutEffect;

/** Whether an element is displayed — an ancestor with `display: none` gives it no offset parent and no box. */
export function isDisplayed(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

export function useDisplayed(root: RefObject<HTMLElement | null>): boolean {
  const [displayed, setDisplayed] = useState(false);
  useIsomorphicLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (isDisplayed(el)) {
      setDisplayed(true);
      return;
    }
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      if (!isDisplayed(el)) return;
      watch.disconnect();
      setDisplayed(true);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return displayed;
}
