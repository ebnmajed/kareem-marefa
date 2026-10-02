"use client";

import { useEffect, useRef } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { overflowEdges } from "@/components/ui/tabs";

// The session settings hub's strip — REQ-SES-020, DEC-178. The client half of
// `session-settings-nav.tsx`, which decides the items; this draws them.
//
// ★ LINKS WITH `aria-current="page"`, NOT A TABLIST. Five separate routes are
// a place to go, not panels of one page — the event page's sub-nav is the
// precedent (`event-subnav.tsx`), and `REQ-SES-020` names `aria-current`.
//
// ★ THE CURRENT ITEM COMES FROM THE URL, ON THE CLIENT. The strip lives in a
// layout, and Partial Rendering never re-renders a layout on navigation
// between its pages, so a `current` prop from the server would stay on the
// page the admin arrived at. `useSelectedLayoutSegment()` follows the route.
//
// ★ ONE ROW THAT SCROLLS INSIDE ITSELF, NEVER THE PAGE (REQ-SES-020 at 390 px).
// Five Arabic labels need about 470 px against 358. Not wrapped — `ui/tabs.tsx`
// records why, found twice — and not clipped: the side hiding more fades
// through a mask, so no line of Arabic loses its tashkeel to `overflow`, and
// the current item is brought into view by the strip's own scroll, never
// `scrollIntoView`, which can move the page. Not sticky: SCR-043 already has a
// sticky action bar above the tab bar, and a third layer at 844 px is the
// event page's rejected option.

export interface SessionSettingsStripItem {
  key: string;
  href: string;
  label: string;
  /** The route segment under `admin/sessions/[id]` that marks it current; null for a link out of the hub. */
  segment: string | null;
}

const FADE = "32px";

function applyEdgeFade(list: HTMLElement) {
  const direction = getComputedStyle(list).direction === "rtl" ? "rtl" : "ltr";
  const { start, end } = overflowEdges(list.scrollLeft, list.scrollWidth, list.clientWidth, direction);
  if (!start && !end) {
    delete list.dataset.overflow;
    list.style.removeProperty("mask-image");
    list.style.removeProperty("-webkit-mask-image");
    return;
  }
  list.dataset.overflow = start && end ? "both" : start ? "start" : "end";
  // The mask is physical; the state above is logical.
  const left = direction === "rtl" ? end : start;
  const right = direction === "rtl" ? start : end;
  const mask = `linear-gradient(to right, ${left ? "transparent" : "black"} 0, black ${FADE}, black calc(100% - ${FADE}), ${right ? "transparent" : "black"} 100%)`;
  list.style.setProperty("mask-image", mask);
  list.style.setProperty("-webkit-mask-image", mask);
}

function revealCurrent(list: HTMLElement) {
  const current = list.querySelector<HTMLElement>('[aria-current="page"]');
  if (!current) return;
  const listBox = list.getBoundingClientRect();
  const box = current.getBoundingClientRect();
  if (box.left < listBox.left) list.scrollLeft -= listBox.left - box.left + 16;
  else if (box.right > listBox.right) list.scrollLeft += box.right - listBox.right + 16;
}

export function SessionSettingsStrip({ label, items }: { label: string; items: SessionSettingsStripItem[] }) {
  const segment = useSelectedLayoutSegment();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => applyEdgeFade(list);
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [items.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    revealCurrent(list);
    applyEdgeFade(list);
  }, [segment]);

  return (
    <nav aria-label={label} data-session-settings="" className="mb-6 min-w-0 border-b border-edge">
      <ul ref={listRef} className="flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const isCurrent = item.segment !== null && item.segment === segment;
          return (
            <li key={item.key} className="shrink-0">
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`inline-flex h-11 items-center whitespace-nowrap px-3 text-body outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)] ${
                  isCurrent ? "font-medium text-fg-heading shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-fg-muted hover:text-fg-heading"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
