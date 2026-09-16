"use client";

import { usePathname } from "next/navigation";
import { useId, useState, useSyncExternalStore, type ComponentType } from "react";
import { IconButton } from "@/components/ui/icon-button";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BellIcon,
  BookmarkFilledIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronIcon,
  ClockIcon,
  DownloadIcon,
  GearIcon,
  HomeIcon,
  ImageIcon,
  LockIcon,
  MenuIcon,
  PaletteIcon,
  PinIcon,
  StarIcon,
  TagIcon,
  UserIcon,
} from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Menu } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/sheet";

// ★ A REAL BUG, FOUND ON A REAL BUILD (the lead's worktree run): `AdminRailItem`
// used to carry `Icon: ComponentType<...>` — a plain function, built in
// `admin/layout.tsx` (a Server Component) and passed as a prop to THIS
// module ("use client"). `icons.tsx` is not itself a client module, so every
// icon it exports is an ordinary function, and React Flight refuses to
// serialise a function crossing the server/client boundary at all — not
// just the "factory that returns a bound Server Action" shape found in
// `sessions-table.tsx`/`members-table.tsx` earlier this wave, but the plain
// component-reference case, which is even more basic and was missed because
// `tsc` has no way to see it either. Every admin page crashed
// («تعذّر تحميل هذا القسم») for every staff member until this was fixed.
//
// The fix: `AdminRailItem.icon` is now a STRING KEY, resolved against this
// map — which lives here, in the client module, so the actual `ComponentType`
// values never leave it. `admin/layout.tsx` passes `icon: "home"` etc., not
// a function.
const ICONS = {
  home: HomeIcon,
  checkCircle: CheckCircleIcon,
  calendar: CalendarIcon,
  pin: PinIcon,
  tag: TagIcon,
  building: BuildingIcon,
  user: UserIcon,
  alertCircle: AlertCircleIcon,
  image: ImageIcon,
  alertTriangle: AlertTriangleIcon,
  star: StarIcon,
  bookmarkFilled: BookmarkFilledIcon,
  palette: PaletteIcon,
  bell: BellIcon,
  clock: ClockIcon,
  download: DownloadIcon,
  lock: LockIcon,
  gear: GearIcon,
} as const satisfies Record<string, ComponentType<{ className?: string }>>;

export type AdminRailIconKey = keyof typeof ICONS;

// The admin console's left rail — `16` §6.7, `REQ-UIX-017`'s second skip
// link, wave 6 (`DEC-130`), regrouped into the fourteen-group IA for wave 7
// (`DEC-137`, `docs/plan/notes/console.md`'s "Wave 7 plan" §1 is the plan
// this implements).
//
// ★ The current item is decided HERE, from `usePathname()` — as
// `shell/tab-bar.tsx` decides its tab since wave 7. It was decided in
// `admin/layout.tsx` from the `x-pathname` header, and a layout is not
// re-rendered on a client-side navigation: moving from «النقاط» to «السجل»
// left «النقاط» marked (`platform` found it planning its own console). The
// pathname is known during the server render too, so there is no flash.
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
//
// ── the fourteen-group regroup (wave 7) ───────────────────────────────────
//
// `AdminRailItem` now carries an optional `children`: ten of the fourteen
// groups are still one route (rendered exactly as before — an `<a>`-shaped
// rail item), four disclose 2–3 routes each (moderation, points ×
// recognition, the two template libraries, emails × reminders). A child
// never carries its own icon — only the group does — so there is no
// icon-reuse collision to solve at the nested level, unlike the flat list's
// own adjacent-icon problem (`admin/layout.tsx`'s own comments on
// `recognition`/`templatesCertificates`).
//
// Three renderings of a group, by surface:
//   - Phone sheet: always the inline disclosure below (full-height drawer,
//     room for a real nested list — a popover inside a popover-ish sheet
//     would be the wrong composition).
//   - Desktop, rail EXPANDED: the same inline disclosure.
//   - Desktop, rail COLLAPSED (icon-only): a `ui/menu` flyout instead — a
//     collapsed group's icon has no room for a label or a nested list, and
//     `menu.tsx`'s own header comment already names "the admin sub-nav" as
//     a use this component was fixed for (`href` items route through
//     `ui/link`, not a raw `<a>`, found while planning wave 6).
//
// A group's own expand/collapse state is a per-viewer `localStorage`
// convenience, one entry per group key, same try/catch-and-render-safely
// discipline as the whole-rail toggle below — `useGroupExpanded` generalises
// that single-toggle pattern to an arbitrary number of groups via a
// module-level `Map` of stores, one per group key, instead of duplicating
// the toggle's three module-level variables four times. A group with no
// stored preference yet defaults to EXPANDED only if it contains the
// current route, so a staff member always lands inside an open section
// without every other group defaulting open too.

export interface AdminRailChild {
  key: string;
  href: string;
  label: string;
}

export interface AdminRailItem {
  key: string;
  label: string;
  /** A key into `ICONS`, not the component itself — see the note above. */
  icon: AdminRailIconKey;
  /** Leaf only. */
  href?: string;
  /** Leaf only: current on its own path alone, never on a route below it —
   *  the dashboard, whose `/app/admin` prefixes every other. */
  exact?: boolean;
  /** Group only — always at least one entry when present. */
  children?: AdminRailChild[];
}

/** The path without its locale prefix, as the rail's hrefs are written. */
function useRailPath(): string {
  return (usePathname() ?? "").replace(/^\/(ar|en)(?=\/|$)/, "");
}

function isCurrent(href: string, path: string, exact = false): boolean {
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

function itemContainsCurrent(item: AdminRailItem, path: string): boolean {
  if (item.children) return item.children.some((c) => isCurrent(c.href, path));
  return item.href !== undefined && isCurrent(item.href, path, item.exact);
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

// ── per-group disclosure state ─────────────────────────────────────────
//
// One store per group KEY (not per group instance — the key is stable
// across renders and across the phone sheet / desktop rail, which render
// the SAME group independently, and both should agree on whether it's open).

interface GroupStore {
  cache: boolean;
  hydrated: boolean;
  listeners: Set<() => void>;
}

const groupStores = new Map<string, GroupStore>();

function getGroupStore(key: string): GroupStore {
  let store = groupStores.get(key);
  if (!store) {
    store = { cache: false, hydrated: false, listeners: new Set() };
    groupStores.set(key, store);
  }
  return store;
}

const GROUP_STORAGE_PREFIX = "kareem:admin-rail-group:";

// ★ `react-hooks/immutability` (the React Compiler lint) refuses to let a
// component/hook body mutate a local that was obtained by calling a
// function — even a plain one like `getGroupStore()` — if that local is then
// read inside a callback passed to a hook (`useSyncExternalStore` here). The
// rule only analyses the literal function bodies written INSIDE a
// component/hook; it does not descend into functions merely referenced or
// called from there. So the three functions below — the ones that actually
// touch `localStorage` and mutate a `GroupStore` — are plain, genuinely
// module-level functions (like `getSnapshot`/`setCollapsedPreference` above
// already are, for the single whole-rail toggle); `useGroupExpanded`, the
// hook, only wires thin closures that CALL them, never mutating anything in
// its own body. Same idiom, generalised from one store to a `Map` of them.
function groupSubscribe(key: string, listener: () => void) {
  const store = getGroupStore(key);
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

function groupGetSnapshot(key: string, defaultExpanded: boolean): boolean {
  const store = getGroupStore(key);
  if (!store.hydrated) {
    try {
      const raw = window.localStorage.getItem(`${GROUP_STORAGE_PREFIX}${key}`);
      store.cache = raw === null ? defaultExpanded : raw === "1";
    } catch {
      store.cache = defaultExpanded;
    }
    store.hydrated = true;
  }
  return store.cache;
}

function groupToggle(key: string) {
  const store = getGroupStore(key);
  const next = !store.cache;
  try {
    window.localStorage.setItem(`${GROUP_STORAGE_PREFIX}${key}`, next ? "1" : "0");
  } catch {
    // Per-viewer convenience only, same discipline as the whole-rail toggle.
  }
  store.cache = next;
  store.hydrated = true;
  for (const listener of store.listeners) listener();
}

function useGroupExpanded(groupKey: string, defaultExpanded: boolean): [boolean, () => void] {
  const expanded = useSyncExternalStore(
    (listener) => groupSubscribe(groupKey, listener),
    () => groupGetSnapshot(groupKey, defaultExpanded),
    () => defaultExpanded,
  );
  return [expanded, () => groupToggle(groupKey)];
}

function itemClassName(current: boolean) {
  return `flex min-h-11 items-center gap-3 rounded-field px-3 py-2.5 text-label ${
    current ? "bg-silver-100 text-fg-heading" : "text-fg-body hover:bg-silver-100 hover:text-fg-heading"
  }`;
}

/** The inline disclosure a group renders as, on the phone sheet and on the
 *  desktop rail when it is EXPANDED. Never rendered on the collapsed rail —
 *  see `CollapsedGroupMenu` for that surface. */
function GroupDisclosure({ item, path, onNavigate }: { item: AdminRailItem; path: string; onNavigate?: () => void }) {
  const [expanded, toggle] = useGroupExpanded(item.key, itemContainsCurrent(item, path));
  const listId = useId();
  const Icon = ICONS[item.icon];

  return (
    <li>
      <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={toggle} className={`w-full ${itemClassName(false)}`}>
        <Icon className="shrink-0 text-[1.25rem]" />
        <span className="min-w-0 flex-1 truncate text-start">
          <bdi>{item.label}</bdi>
        </span>
        <ChevronIcon direction={expanded ? "up" : "down"} className="shrink-0 text-[1rem] text-fg-muted" />
      </button>
      {expanded ? (
        <ul id={listId} className="mt-1 space-y-1 ps-8">
          {item.children?.map((child) => {
            const current = isCurrent(child.href, path);
            return (
              <li key={child.key}>
                <Link href={child.href} quiet aria-current={current ? "page" : undefined} className={itemClassName(current)} onClick={onNavigate}>
                  <bdi>{child.label}</bdi>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/** A collapsed (icon-only) rail's rendering of a group — a `ui/menu` flyout
 *  from the group's own icon, since a collapsed column has no room for a
 *  label or a nested list. */
function CollapsedGroupMenu({ item }: { item: AdminRailItem }) {
  const Icon = ICONS[item.icon];
  return (
    <Menu
      align="start"
      trigger={
        <IconButton label={item.label} size="md" className="w-full justify-center">
          <Icon className="shrink-0 text-[1.25rem]" />
        </IconButton>
      }
      items={(item.children ?? []).map((child) => ({ label: child.label, href: child.href }))}
    />
  );
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
  const path = useRailPath();

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
          {items.map((item) =>
            item.children ? (
              <GroupDisclosure key={item.key} item={item} path={path} onNavigate={() => setSheetOpen(false)} />
            ) : (
              <li key={item.key}>
                <Link
                  href={item.href ?? "#"}
                  quiet
                  aria-current={itemContainsCurrent(item, path) ? "page" : undefined}
                  className={itemClassName(itemContainsCurrent(item, path))}
                  onClick={() => setSheetOpen(false)}
                >
                  {(() => {
                    const Icon = ICONS[item.icon];
                    return <Icon className="shrink-0 text-[1.25rem]" />;
                  })()}
                  <bdi>{item.label}</bdi>
                </Link>
              </li>
            ),
          )}
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
          {items.map((item) => {
            if (item.children) {
              return collapsed ? <CollapsedGroupMenu key={item.key} item={item} /> : <GroupDisclosure key={item.key} item={item} path={path} />;
            }
            const Icon = ICONS[item.icon];
            const current = itemContainsCurrent(item, path);
            return (
              <li key={item.key}>
                <Link
                  href={item.href ?? "#"}
                  quiet
                  aria-current={current ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`${itemClassName(current)} ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <Icon className="shrink-0 text-[1.25rem]" />
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
            );
          })}
        </ul>
      </nav>
    </>
  );
}
