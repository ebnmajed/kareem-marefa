"use client";

import { useEffect, useRef } from "react";
import { Tabs as RadixTabs } from "radix-ui";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/components/sessions/numerals";
import type { TabsProps } from "@/components/ui";

// The house tabs over Radix (DEC-019): keyboard arrow roving, `role="tablist"`
// / `role="tab"` and `aria-selected` are Radix's, direction comes from the
// layout's `Direction.Provider` (never passed here — a second `dir` source is
// exactly what the spawn note forbids). `dialog.tsx` is the house precedent
// for the wrapper shape.
//
// `TabItem.href` makes a trigger a real navigation link (Radix's own
// documented `asChild` pattern) rather than an in-page panel switch — the
// admin sub-nav and any URL-addressable tab strip use this; `value` stays
// the CALLER's source of truth (typically derived from the current route),
// so a full page navigation and a Radix "selected" re-render agree without
// this component owning any routing logic of its own.
//
// `TabsProps.children` is ONE opaque blob, not per-tab panels — the caller
// swaps it itself when `value` changes, this component never branches on
// which tab is active. But every `Tabs.Trigger` Radix renders still carries
// an `aria-controls` pointing at a `Tabs.Content` with a matching id
// (`radix-…-content-<value>`), REGARDLESS of whether this wrapper renders
// one — an unresolved `aria-controls` is a real, axe-caught WCAG 4.1.2
// violation, found writing this component's own test. So one `Tabs.Content`
// is rendered PER item, all wrapping the SAME `children` — not a
// duplication in the accessibility tree, because Radix only ever mounts the
// Content matching the current value and leaves the rest out of the DOM
// entirely (no `forceMount`).
//
// `count` is a raw number, printed in Western digits (`DEC-124`).
//
// ★ A STRIP THAT SCROLLS SAYS SO (wave 8, the lead's sync-1 finding). At
// 390 px the three moderation queues do not fit, and the capture showed
// «بلاغات الصور»'s count cut at the edge with nothing to say more was there —
// on the very page where that tab was the ACTIVE one. Two things, both from
// the list's own geometry and neither from state: the side that has more
// fades out (a mask, so the text itself is never clipped by `overflow`), and
// the active tab is scrolled into view within the strip — by adjusting the
// strip's own scroll, never `scrollIntoView`, which can move the page.

/** Which logical sides of a horizontal scroller hide more content. RTL
 *  `scrollLeft` is 0 at the inline start and runs negative toward the end, in
 *  every engine this product targets. */
export function overflowEdges(scrollLeft: number, scrollWidth: number, clientWidth: number, direction: "rtl" | "ltr"): { start: boolean; end: boolean } {
  const max = scrollWidth - clientWidth;
  if (max <= 1) return { start: false, end: false };
  const fromStart = direction === "rtl" ? -scrollLeft : scrollLeft;
  return { start: fromStart > 1, end: fromStart < max - 1 };
}

const FADE = "32px";

function applyEdgeFade(list: HTMLElement) {
  const direction = getComputedStyle(list).direction === "rtl" ? "rtl" : "ltr";
  const { start, end } = overflowEdges(list.scrollLeft, list.scrollWidth, list.clientWidth, direction);
  // The logical state as an attribute, so a test (jsdom keeps no `mask-image`)
  // and a stylesheet can both read it; the mask itself is physical.
  if (!start && !end) {
    delete list.dataset.overflow;
    list.style.removeProperty("mask-image");
    list.style.removeProperty("-webkit-mask-image");
    return;
  }
  list.dataset.overflow = start && end ? "both" : start ? "start" : "end";
  const left = direction === "rtl" ? end : start;
  const right = direction === "rtl" ? start : end;
  const mask = `linear-gradient(to right, ${left ? "transparent" : "black"} 0, black ${FADE}, black calc(100% - ${FADE}), ${right ? "transparent" : "black"} 100%)`;
  list.style.setProperty("mask-image", mask);
  list.style.setProperty("-webkit-mask-image", mask);
}

function revealActive(list: HTMLElement) {
  const active = list.querySelector<HTMLElement>('[data-state="active"]');
  if (!active) return;
  const listBox = list.getBoundingClientRect();
  const box = active.getBoundingClientRect();
  if (box.left < listBox.left) list.scrollLeft -= listBox.left - box.left + 16;
  else if (box.right > listBox.right) list.scrollLeft += box.right - listBox.right + 16;
}

export function Tabs({
  items,
  label,
  value,
  defaultValue,
  onValueChange,
  children,
  className = "",
}: TabsProps & { }) {
  const listRef = useRef<HTMLDivElement>(null);

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
    revealActive(list);
    applyEdgeFade(list);
  }, [value]);

  return (
    <RadixTabs.Root value={value} defaultValue={defaultValue} onValueChange={onValueChange} className={className}>
      {/* ★ NOT `flex-wrap` — a real sync-3/sync-2 finding, hit twice by two
          different callers (this file's own `moderation-tabs.tsx` at 390 px,
          and independently by `content`'s `me/tab-strip.tsx`, which forked
          rather than wait). A wrapped tab strip breaks the one-row scanning
          a tablist promises and, worse, can silently push a later tab's
          trigger out of the roving-tabindex sequence's visual order. Every
          trigger already carries `whitespace-nowrap` (below), so the fix is
          the CONTAINER: scroll in one row instead of wrapping onto a second
          line — `overflow-x-auto` on the list itself, matching the same
          "the active item is reachable by keyboard regardless of how many
          fit" contract `admin-rail.tsx`'s own desktop rail already keeps. */}
      <RadixTabs.List ref={listRef} aria-label={label} className="flex flex-nowrap gap-1 overflow-x-auto border-b border-edge">
        {items.map((item) => {
          const inner = (
            <>
              <span>{item.label}</span>
              {item.count !== undefined ? (
                <span className="ms-1.5 rounded-full bg-silver-100 px-1.5 py-0.5 text-body-sm text-fg-muted">
                  {formatNumber(item.count)}
                </span>
              ) : null}
            </>
          );
          const triggerClass =
            "relative -mb-px inline-flex h-11 items-center whitespace-nowrap rounded-t-field px-3 text-label text-fg-body outline-none hover:text-fg-heading data-[state=active]:border-b-2 data-[state=active]:border-[var(--btn-bg)] data-[state=active]:text-fg-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";
          return item.href ? (
            <RadixTabs.Trigger key={item.value} value={item.value} asChild className={triggerClass}>
              <Link href={item.href}>{inner}</Link>
            </RadixTabs.Trigger>
          ) : (
            <RadixTabs.Trigger key={item.value} value={item.value} className={triggerClass}>
              {inner}
            </RadixTabs.Trigger>
          );
        })}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value} className="mt-4">
          {children}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
