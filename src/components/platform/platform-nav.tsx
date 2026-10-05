import type { AdminRailLink } from "@/components/ui";

// The platform console's destinations — SCR-080 … 085, REQ-UIX-118, REQ-ADM-001, DEC-NEXT-38. The lead's.
//
// ★★ THIS PATH IS KEPT ON PURPOSE (`DEC-249` §3). `tests/unit/console-register.test.ts` names
// `components/platform/platform-nav.tsx` as one of four files that prove the console's import graph is walked at
// all, and that guard — the only thing between the console and the playground's motion — is not edited inside a nav
// refactor. So the old nav COMPONENT was deleted (`DEC-208`) and this file returns as what replaces it: the SECOND
// NAV SET that `ui/admin-rail` draws for `/app/platform`, through `shell/console-frame`. Only the path survived.
//
// Kept from the old component, by name (`docs/plan/notes/platform.md` W26.2.0, F5 – F12):
//   · F5 — no org-scoped link: a super admin has no org (`DEC-014`);
//   · F6 — the five sections in this order, their words from `platform.shell.nav.*`;
//   · F7 — the home is current on its own path alone; every other section by prefix, so `orgs/new` and
//     `orgs/[id]/domains` keep «المؤسسات» — `exact` here, `admin-rail`'s `isCurrent` there;
//   · F8, F9 — `current` is read on the client from `usePathname()` and marked `aria-current="page"`; the `nav`
//     landmark is named «لوحة المنصة». Both are `admin-rail`'s, which is why this file holds data and no hook;
//   · F11 — nothing but strings and booleans crosses the server/client boundary (`DEC-159`);
//   · F12 — every label in `<bdi>` (the rail's).
// Not kept, and why: the icons — the console frame's rail draws none (`M11a.md` §0, the artboards); and F10's phone
// section switcher on `ui/menu` — under `lg` the frame's sheet behind ≡ is the phone's navigation, as on every
// console screen since wave 21.
//
// One ruled group: the six `Platform*.dc.html` boards draw the five items with no rule between them.

export type PlatformNavKey = "home" | "orgs" | "templates" | "metrics" | "impersonate";

export interface PlatformNavLeaf {
  key: PlatformNavKey;
  href: string;
  /** The home: current on its own path alone. */
  exact?: boolean;
}

export const PLATFORM_NAV: readonly PlatformNavLeaf[] = [
  { key: "home", href: "/app/platform", exact: true },
  { key: "orgs", href: "/app/platform/orgs" },
  { key: "templates", href: "/app/platform/templates" },
  { key: "metrics", href: "/app/platform/metrics" },
  { key: "impersonate", href: "/app/platform/impersonate" },
];

/** The rail's groups — plain data, ready to cross into the client rail. */
export function platformRailGroups(label: (key: PlatformNavKey) => string): AdminRailLink[][] {
  return [PLATFORM_NAV.map((leaf) => ({ key: leaf.key, href: leaf.href, label: label(leaf.key), ...(leaf.exact ? { exact: true } : {}) }))];
}

/** Which section a path is in — the home exactly, the rest by prefix, the locale and a trailing slash ignored. */
export function platformSection(pathname: string | null): PlatformNavKey | null {
  const path = (pathname ?? "").replace(/^\/(ar|en)(?=\/|$)/, "").replace(/\/+$/, "");
  const hit = PLATFORM_NAV.find((leaf) => (leaf.exact ? path === leaf.href : path === leaf.href || path.startsWith(`${leaf.href}/`)));
  return hit?.key ?? null;
}
