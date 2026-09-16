"use client";

import { useState, useSyncExternalStore, type ComponentType } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { MenuIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Sheet } from "@/components/ui/sheet";

// The admin console's left rail — `16` §6.7, `REQ-UIX-017`'s second skip
// link, wave 6 (`DEC-130`). `admin/layout.tsx` (server) computes `current`
// from the `x-pathname` header — the same mechanism `shell/tab-bar.tsx`
// already uses — and passes it down, so this component never calls
// `usePathname()` itself and there is no hydration-time flash on the active
// item (the reason `tab-bar.tsx`'s own comment gives for doing the same).
//
// Desktop: a persistent, collapsible `<aside>`. Collapse state is a
// per-viewer `localStorage` convenience only — never read by the server,
// wrapped in try/catch, and the rail renders correctly (expanded) if it
// throws or comes back empty. Phone: the rail is replaced entirely by a
// small top bar and a `ui/sheet` drawer from the reading-start edge — a
// persistent rail at 390 px would eat a third of the viewport before any
// page content renders, and `ui/sheet` is exactly the primitive named for
// "anything that would otherwise be a modal at 390 px".
//
// Both chrome blocks exist in the DOM at once, one hidden by `md:`/default
// Tailwind display utilities per breakpoint — never both mounted-and-focusable,
// so the second skip link's tab order is unambiguous at any width.

export interface AdminRailItem {
  key: string;
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  current: boolean;
}

const STORAGE_KEY = "kareem:admin-rail-collapsed";

// ★ `useSyncExternalStore`, the same idiom `ui/route-progress.tsx` already
// uses for "client-only state that must not become a hydration mismatch" —
// not a `useEffect` that calls `setState` on mount, which
// `react-hooks/set-state-in-effect` refuses outright, and which would still
// cost an extra render for the same result. `getServerSnapshot` is the
// answer during SSR and the FIRST client render alike (both "expanded"), so
// there is nothing to reconcile; `getSnapshot` only diverges once a listener
// (this module's own `toggle`, below) has actually run.
let collapsedCache = false;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  if (!hydrated) {
    try {
      collapsedCache = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      collapsedCache = false;
    }
    hydrated = true;
  }
  return collapsedCache;
}

function getServerSnapshot(): boolean {
  return false;
}

function setCollapsedPreference(next: boolean) {
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A per-viewer convenience only — a blocked or full store changes
    // nothing about whether the rail renders correctly this session.
  }
  collapsedCache = next;
  hydrated = true;
  emit();
}

function itemClassName(current: boolean) {
  return `flex min-h-11 items-center gap-3 rounded-field px-3 py-2.5 text-label ${
    current ? "bg-silver-100 text-fg-heading" : "text-fg-body hover:bg-silver-100 hover:text-fg-heading"
  }`;
}

export function AdminRail({
  items,
  brand,
  collapseLabel,
  expandLabel,
  openLabel,
}: {
  items: AdminRailItem[];
  brand: string;
  collapseLabel: string;
  expandLabel: string;
  openLabel: string;
}) {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [sheetOpen, setSheetOpen] = useState(false);

  function toggle() {
    setCollapsedPreference(!collapsed);
  }

  return (
    <>
      {/* Phone: a small top bar, the menu trigger only. */}
      <div className="flex items-center justify-between gap-3 border-b border-edge pb-3 md:hidden">
        <p className="text-label text-fg-heading">
          <bdi>{brand}</bdi>
        </p>
        <IconButton label={openLabel} onClick={() => setSheetOpen(true)}>
          <MenuIcon />
        </IconButton>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={brand} side="inline-start">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                quiet
                aria-current={item.current ? "page" : undefined}
                className={itemClassName(item.current)}
                onClick={() => setSheetOpen(false)}
              >
                <item.Icon className="shrink-0 text-[1.25rem]" />
                <bdi>{item.label}</bdi>
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>

      {/* Desktop: the persistent, collapsible rail. */}
      <nav aria-label={brand} className="hidden shrink-0 md:block">
        <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : "justify-between"}`}>
          {collapsed ? null : (
            <p className="min-w-0 truncate text-label text-fg-heading">
              <bdi>{brand}</bdi>
            </p>
          )}
          {/* `aria-expanded` belongs on the control, not on the `nav`
              landmark itself — the implicit `navigation` role does not
              support it (jsx-a11y/role-supports-aria-props). */}
          <IconButton label={collapsed ? expandLabel : collapseLabel} size="sm" aria-expanded={!collapsed} onClick={toggle}>
            <MenuIcon />
          </IconButton>
        </div>
        <ul className={`mt-4 space-y-1 ${collapsed ? "w-14" : "w-56"}`}>
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                quiet
                aria-current={item.current ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`${itemClassName(item.current)} ${collapsed ? "justify-center px-0" : ""}`}
              >
                <item.Icon className="shrink-0 text-[1.25rem]" />
                {collapsed ? (
                  <span className="sr-only">
                    <bdi>{item.label}</bdi>
                  </span>
                ) : (
                  <span className="min-w-0 truncate">
                    <bdi>{item.label}</bdi>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
