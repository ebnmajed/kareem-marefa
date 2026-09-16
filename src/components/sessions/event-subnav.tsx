"use client";

import { useEffect, useState } from "react";
import type { EventSectionId } from "@/components/sessions/slots";

// The event page's sub-nav — `16` §6.3, §3.1, REQ-UIX-017.
//
// A scroll-spy on desktop, a horizontally scrolling row on the phone, and a
// section with nothing in it is not listed: the page builds `items` from the
// same `isSectionShown()` that decides whether each section renders, so an
// entry can never point at a section that is not there.
//
// ★ STICKY ON DESKTOP ONLY. On a 390 px phone the shell's header is already
// sticky and the bottom action bar is fixed; a third fixed layer would leave the
// member reading through a slot. On desktop it sticks under the header, and
// `data-event-subnav` is what `globals.css` reads to add its height to the scroll
// padding — so a section jump, and a focused control, land below it rather than
// behind it (`SC 2.4.11`).
//
// Same-page anchors, so plain `<a href="#…">`: there is no navigation to show
// progress for. The current section is `aria-current="true"` — a location, not
// a selected tab; these are links, not a tab list.
//
// ★ THE ROW SCROLLS, IT NEVER CLIPS. `overflow-x: auto` — a clipped line of
// Arabic loses its tashkeel (`10` §1).

export interface EventSubnavProps {
  label: string;
  items: { id: EventSectionId; label: string }[];
}

export function EventSubnav({ label, items }: EventSubnavProps) {
  const [current, setCurrent] = useState<EventSectionId | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    // A band just under the sticky layers: the section whose top has crossed it
    // most recently is the one being read.
    const observer = new IntersectionObserver(
      (entries) => {
        const inBand = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (inBand[0]) setCurrent(inBand[0].target.id as EventSectionId);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav aria-label={label} data-event-subnav="" className="z-20 border-b border-edge bg-canvas md:sticky md:top-[var(--header-h)]">
      <ul className="flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const isCurrent = item.id === current;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => setCurrent(item.id)}
                className={`inline-flex h-11 items-center whitespace-nowrap px-3 text-body md:h-[52px] ${
                  isCurrent ? "font-medium text-fg-heading shadow-[inset_0_-2px_0_var(--fg-heading)]" : "text-fg-muted hover:text-fg-heading"
                }`}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
