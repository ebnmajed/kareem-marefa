"use client";

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
// `count` is a raw number (`16` §4.2), and nothing in `TabsProps` carries the
// org's numeral system — the same gap `date-time.tsx`/`combobox.tsx` flag in
// `docs/plan/notes/console.md`. Same interim: an excess, optional prop, WESTERN
// by default (`org_settings.numerals`'s own column default).

export function Tabs({
  items,
  label,
  value,
  defaultValue,
  onValueChange,
  children,
  className = "",
}: TabsProps & { }) {
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
      <RadixTabs.List aria-label={label} className="flex flex-nowrap gap-1 overflow-x-auto border-b border-edge">
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
