"use client";

import { useEffect, useMemo, useState } from "react";
import { useShowsEditOnly } from "@/components/sessions/edit-mode";
import type { EventSectionId } from "@/components/sessions/slots";

// The event page's sub-nav — rebuilt in wave 18 from `Event.dc.html:63-69` (REQ-UIX-017, REQ-UIX-061, `16`
// §6.3): a row of chips, one per section that renders, with the slot's count where it has one («النقاش 3»).
//
// ★ ONLY SECTIONS THAT RENDER. The page builds `items` from the same `isSectionShown()` that decides whether
// each section renders, so an entry never points at nothing. An item may be `lgHidden` when its section is
// not drawn from `lg` («نبذة» — the abstract is in the desktop hero).
//
// ★ A SCROLL-SPY: the section being read is `aria-current="true"` — a location, not a selected tab; these are
// links, not a tab list. Sticky from `md` under the shell's bar, and `data-event-subnav` is what `globals.css`
// reads to add its height to the scroll padding, so a jump and a focused control land below it (SC 2.4.11).
//
// ★ THE ROW SCROLLS, IT NEVER CLIPS: `overflow-x: auto` — a clipped line of Arabic loses its tashkeel (`10` §1).
// Same-page anchors, so plain `<a href="#…">`. Hidden under two items: one chip is not a navigation.

export interface EventSubnavItem {
  id: EventSectionId;
  label: string;
  /** Pre-formatted, Western digits — «3». Part of the link's name. */
  count?: string;
  /** Not drawn from `lg`, because its section is not. */
  lgHidden?: boolean;
  /** Its section is drawn in edit mode alone (`SlotSummary.editOnly`), so its entry is too. */
  editOnly?: boolean;
}

export function EventSubnav({ label, items: all }: { label: string; items: EventSubnavItem[] }) {
  const showsEditOnly = useShowsEditOnly();
  const items = useMemo(() => all.filter((item) => showsEditOnly || !item.editOnly), [all, showsEditOnly]);
  const [current, setCurrent] = useState<EventSectionId | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    // A band just under the sticky layers: the section whose top has crossed it most recently is the one read.
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
    <nav aria-label={label} data-event-subnav="" className="z-20 border-b border-edge bg-canvas py-2 md:sticky md:top-[var(--header-h)] lg:static">
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => {
          const isCurrent = item.id === current;
          return (
            <li key={item.id} className={`shrink-0 ${item.lgHidden ? "lg:hidden" : ""}`}>
              <a
                href={`#${item.id}`}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => setCurrent(item.id)}
                className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3.5 text-body-sm font-bold ${
                  isCurrent ? "border-accent bg-accent text-on-accent" : "border-edge bg-surface text-fg-heading hover:bg-hover"
                }`}
              >
                <span>{item.label}</span>
                {/* A real space: the count is part of the name, and «النقاش5» is not a word. */}
                {item.count ? " " : null}
                {item.count ? <span className={isCurrent ? "" : "text-fg-muted"}>{item.count}</span> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
