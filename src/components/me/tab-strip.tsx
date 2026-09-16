"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";

export interface MeTabItem {
  /** Locale-less, matching `Link`'s own convention — `/app/me/points`. */
  href: string;
  label: string;
}

/**
 * The `/app/me` hub's persistent tab strip (`16` §6.5) — content's own, not
 * `ui/tabs`.
 *
 * Each item is a REAL navigation to a different route, not an in-page panel
 * switch, so this is a `<nav>` of links rather than a `role="tablist"`
 * widget — the ARIA Authoring Practices' own distinction (tabs switch
 * content on one page; a set of links to different pages is a nav), and it
 * needs no roving-tabindex logic of its own because native anchors already
 * tab in sequence.
 *
 * `ui/tabs` (console's) was the first thing tried: it already supports
 * exactly this `href` mode. But its `RadixTabs.List` hard-codes
 * `flex flex-wrap` with no override hook exposed through `TabsProps`, and
 * seven items wrap onto three lines at 390 px instead of scrolling in one —
 * the lead asked for a single row that scrolls inside its own
 * `overflow-x-auto`, with the active tab scrolled into view, never a
 * page-level horizontal scroll. Flagged as a request in
 * `docs/plan/notes/content.md` (a `scroll` variant on `ui/tabs`); this
 * component is the interim, not a permanent fork — swap back if that lands.
 *
 * Active state reads `usePathname()` directly (client-side) rather than
 * taking the current route as a prop from `me/layout.tsx`: Partial Rendering
 * means the layout does not re-execute on an in-hub navigation, so a
 * server-computed "active" prop would go stale the moment a member taps a
 * second tab. `next/navigation`'s hook (not next-intl's own wrapper) plus a
 * manual locale strip, matching `shell/tab-bar.tsx`'s established pattern.
 */
export function MeTabStrip({ label, items }: { label: string; items: MeTabItem[] }) {
  const pathname = usePathname();
  const withoutLocale = (pathname ?? "").replace(/^\/(ar|en)(?=\/|$)/, "");
  const activeRef = useRef<HTMLLIElement>(null);

  // Scrolls the current tab into view on every navigation inside the hub —
  // the one behaviour `overflow-x-auto` needs help with, since the browser
  // has no reason on its own to know which of seven links matters right now.
  useEffect(() => {
    // jsdom has no `scrollIntoView` at all (not even a no-op) — guarded so
    // component tests render this effect instead of throwing.
    activeRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [withoutLocale]);

  return (
    <nav aria-label={label} className="overflow-x-auto border-b border-edge">
      <ul className="flex gap-1">
        {items.map((item) => {
          const current = withoutLocale === item.href;
          return (
            <li key={item.href} ref={current ? activeRef : undefined}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`relative -mb-px inline-flex h-11 items-center whitespace-nowrap px-3 text-label outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
                  current ? "border-b-2 border-[var(--btn-bg)] text-fg-heading" : "text-fg-body hover:text-fg-heading"
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
