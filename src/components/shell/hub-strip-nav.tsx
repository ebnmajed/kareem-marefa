"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/components/ui/link";

export interface HubStripItem {
  /** Locale-less, as `Link` takes it — `/app/me/points`. */
  href: string;
  label: string;
}

// The strip's client half — `REQ-UIX-070`, the kept-behaviour table in `docs/plan/notes/wave-20-lead.md` (F1).
//
// Real links to different routes, so a `<nav>` and not a tablist. The current one is read from the path on the
// client: a layout does not re-render on an in-hub navigation, so a server-computed «current» would go stale. It is
// scrolled into view on every navigation, because the row scrolls inside itself and never moves the page.
export function HubStripNav({ label, items, className = "" }: { label: string; items: HubStripItem[]; className?: string }) {
  const pathname = usePathname();
  const path = (pathname ?? "").replace(/^\/(ar|en)(?=\/|$)/, "");
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    // jsdom has no `scrollIntoView`.
    currentRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [path]);

  return (
    <nav aria-label={label} className={`overflow-x-auto ${className}`}>
      <ul className="flex w-max gap-1.5 py-1">
        {items.map((item) => {
          const current = path === item.href;
          return (
            <li key={item.href} ref={current ? currentRef : undefined}>
              <Link
                href={item.href}
                quiet
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded-pill border px-3.5 text-[0.8125rem] font-bold whitespace-nowrap focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
                  current ? "border-accent bg-accent text-on-accent" : "border-edge bg-surface text-fg-heading hover:bg-hover"
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
