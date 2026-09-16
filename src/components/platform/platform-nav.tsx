"use client";

import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BuildingIcon, ChevronIcon, ClockIcon, HomeIcon, ImageIcon, LockIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Menu } from "@/components/ui/menu";

// The super-admin console's navigation — SCR-080 … 085, REQ-ADM-001,
// REQ-UIX-017, `16` §6.7, DEC-111, DEC-147. `docs/plan/notes/platform.md` W8.1
// is the plan this implements.
//
// ★ TWO SHAPES, ONE LIST. Desktop is a persistent rail after the admin
// console's (`16` §6.7): five items, icon and label, not collapsible — five
// items cost 14 rem and there is nothing to hide. A phone gets a SECTION
// SWITCHER on `ui/menu`: its trigger names the section you are in, which a
// hamburger behind a sheet does not, and Radix closes it on selection, on an
// outside press and on Escape with focus returned (DEC-111). Never a
// horizontal scroller — at 390 px an item scrolled out of view reads as not
// being there at all.
//
// ★ `current` IS READ HERE, FROM `usePathname()`, never in the layout. A layout
// is not re-rendered on a client-side navigation, so a current item computed
// there from `x-pathname` is right on a full load and wrong from the second
// screen on — the bug `shell-routes.ts` records for the tab bar. A client
// component still renders on the server with the same path, so there is no
// flash on a full load either.
//
// It takes no props: the icons live in this module and the words come from
// `platform.shell` through the client provider, so nothing crosses the
// server/client boundary — a component reference or a formatter passed from
// the layout is exactly the function React Flight refuses to serialise
// (`admin-rail.tsx`'s header).

export type PlatformNavKey = "home" | "orgs" | "templates" | "metrics" | "impersonate";

const ITEMS: { key: PlatformNavKey; href: string; Icon: ComponentType<{ className?: string }> }[] = [
  { key: "home", href: "/app/platform", Icon: HomeIcon },
  { key: "orgs", href: "/app/platform/orgs", Icon: BuildingIcon },
  { key: "templates", href: "/app/platform/templates", Icon: ImageIcon },
  // No chart glyph exists in the house set yet (requested, notes W8.15 L3);
  // SCR-084's headline number is an age, so the clock stands in.
  { key: "metrics", href: "/app/platform/metrics", Icon: ClockIcon },
  { key: "impersonate", href: "/app/platform/impersonate", Icon: LockIcon },
];

/** Which section a path is in. The home item matches exactly; the rest by prefix, so `orgs/new` keeps «المؤسسات». */
export function platformSection(pathname: string | null): PlatformNavKey | null {
  const path = (pathname ?? "").replace(/^\/(ar|en)(?=\/|$)/, "").replace(/\/$/, "");
  for (const item of ITEMS) {
    if (item.key === "home" ? path === item.href : path === item.href || path.startsWith(`${item.href}/`)) return item.key;
  }
  return null;
}

function itemClassName(current: boolean) {
  return `flex min-h-11 items-center gap-3 rounded-field px-3 py-2.5 text-label ${
    current ? "bg-silver-100 text-fg-heading" : "text-fg-body hover:bg-silver-100 hover:text-fg-heading"
  }`;
}

export function PlatformNav() {
  const t = useTranslations("platform.shell");
  const current = platformSection(usePathname());
  const brand = t("brand");
  const label = (key: PlatformNavKey) => t(`nav.${key}`);
  const currentLabel = label(current ?? "home");

  return (
    <>
      {/* Phone: the brand and the section switcher. */}
      <nav aria-label={brand} className="flex items-center justify-between gap-3 border-b border-edge pb-3 md:hidden">
        <p className="min-w-0 text-label text-fg-muted">
          <bdi>{brand}</bdi>
        </p>
        <Menu
          align="end"
          trigger={
            <Button
              type="button"
              variant="secondary"
              size="md"
              aria-label={t("switcher", { section: currentLabel })}
              iconEnd={<ChevronIcon direction="down" className="text-fg-muted" />}
            >
              <bdi>{currentLabel}</bdi>
            </Button>
          }
          items={ITEMS.map((item) => ({
            label: label(item.key),
            href: item.href,
            icon: <item.Icon className="shrink-0 text-[1.125rem] text-fg-muted" />,
          }))}
        />
      </nav>

      {/* Desktop: the rail. */}
      <nav aria-label={brand} className="hidden shrink-0 md:block">
        <p className="px-3 text-label text-fg-muted">
          <bdi>{brand}</bdi>
        </p>
        <ul className="mt-3 w-56 space-y-1">
          {ITEMS.map((item) => {
            const isCurrent = item.key === current;
            return (
              <li key={item.key}>
                <Link href={item.href} quiet aria-current={isCurrent ? "page" : undefined} className={itemClassName(isCurrent)}>
                  <item.Icon className="shrink-0 text-[1.25rem]" />
                  <span className="min-w-0">
                    <bdi>{label(item.key)}</bdi>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
