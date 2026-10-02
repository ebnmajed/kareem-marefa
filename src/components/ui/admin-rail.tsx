"use client";

import { usePathname } from "next/navigation";
import type { AdminRailLink, AdminRailProps } from "@/components/ui";
import { Link } from "@/components/ui/link";

// The console's navigation — REQ-UIX-084, REQ-UIX-085, DEC-226, DEC-227. The lead's.
//
// ★ ONE LEVEL, SIX RULES. `DEC-137`'s rail was fourteen top-level items, three of them disclosures with children; the
// owner approved the design's shape (`DEC-226`): all twenty destinations on one level, the groups divided by rules that
// render no text. So there is no `children`, no disclosure, no flyout and no per-group storage — the old
// `src/components/admin/admin-rail.tsx` is deleted, and its kept-behaviour table is in `notes/wave-21-lead.md`.
//
// ★ PLAIN DATA ACROSS THE BOUNDARY. The layout is a Server Component; this is a client one. Every prop is a string, a
// number or a boolean — a badge's accessible text arrives already pluralised as `countLabel`, never as a function.
// The old rail crashed every admin page for every staff member when an icon component crossed it (wave 6).
//
// The current item is decided here from `usePathname()`, never by the layout: a layout is not re-rendered on a
// client-side navigation, so a `current` computed there goes stale on the first click (wave 7). The pathname is known
// during the server render too, so there is no flash.
//
// No icon (the artboard draws none), no animation, no hover scale (`REQ-UIX-053`). The width is the frame's.

const strip = (path: string) => path.replace(/^\/(ar|en)(?=\/|$)/, "");

function isCurrent(link: AdminRailLink, path: string): boolean {
  return link.exact ? path === link.href : path === link.href || path.startsWith(`${link.href}/`);
}

export function AdminRail({ groups, label, pathname, onNavigate, className = "" }: AdminRailProps) {
  const routerPath = usePathname();
  const path = strip(pathname ?? routerPath ?? "");
  const visible = groups.filter((group) => group.length > 0);
  if (visible.length === 0) return null;

  return (
    <nav aria-label={label} data-slot="admin-rail" className={className}>
      {visible.map((group, index) => (
        <ul key={group[0].key} className={index > 0 ? "mt-2 border-t border-edge pt-2" : undefined}>
          {group.map((link) => {
            const current = isCurrent(link, path);
            const counted = link.count !== undefined && link.count > 0;
            return (
              <li key={link.key}>
                <Link
                  href={link.href}
                  quiet
                  aria-current={current ? "page" : undefined}
                  onClick={onNavigate}
                  className={`flex min-h-11 items-center justify-between gap-3 rounded-field px-3 py-2 text-label ${
                    current ? "bg-raised font-bold text-fg-heading" : "text-fg-body hover:bg-hover hover:text-fg-heading"
                  }`}
                >
                  <bdi className="min-w-0">{link.label}</bdi>
                  {counted ? (
                    <span className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-pill bg-signal px-1.5 text-caption font-bold text-on-signal">
                      <span aria-hidden="true">
                        <bdi>{link.count}</bdi>
                      </span>
                      <span className="sr-only">{link.countLabel}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}
