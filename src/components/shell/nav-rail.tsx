"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { CalendarIcon, ChartIcon, HomeIcon, PlusIcon, TrophyIcon, UserIcon } from "@/components/ui/icons";
import { NAV, type NavKey } from "@/components/shell/nav-items";
import { hasNavRail, shellPath } from "@/components/shell/shell-routes";

// The desktop navigation rail — built from `docs/design/screens/m10a/HomeDesktop.dc.html`
// (REQ-UIX-054, DEC-205 §2): the big «اقترح جلسة», then the destinations, then a
// ruled staff section with the count of what waits for them. 220 px, sticky under
// the top bar, from `lg`.
//
// It is not rendered on an immersive route or in the console (`hasNavRail`): the
// event page owns its width, and the console has its own rail.
//
// ★ «الأعضاء» is drawn and absent — the route does not exist yet (DEC-206 §4.31).

export interface NavRailProps {
  labels: { nav: string; staffSection: string; admin: string; platform: string; attention: string | null } & Record<Exclude<NavKey, "propose">, string> & {
      propose: string;
    };
  isStaff: boolean;
  isPlatformAdmin: boolean;
  /** The count of what waits for a staff member, already formatted; `null` draws no chip. */
  attentionCount: string | null;
}

const ICONS: Record<Exclude<NavKey, "propose">, typeof HomeIcon> = {
  home: HomeIcon,
  sessions: CalendarIcon,
  board: TrophyIcon,
  me: UserIcon,
};

const item = "flex min-h-[46px] items-center gap-3 rounded-tile px-3.5 font-semibold hover:bg-hover focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

export function NavRail({ labels, isStaff, isPlatformAdmin, attentionCount }: NavRailProps) {
  const pathname = usePathname();
  if (!hasNavRail(pathname)) return null;
  const path = shellPath(pathname);

  return (
    <nav aria-label={labels.nav} className="sticky top-[88px] hidden w-[220px] shrink-0 flex-col gap-1.5 self-start lg:flex">
      <Link
        href="/app/propose"
        aria-current={path.startsWith("/app/propose") ? "page" : undefined}
        className="mb-2.5 flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-accent font-display text-[1.125rem] font-extrabold text-on-accent shadow-press focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)]"
      >
        <PlusIcon aria-hidden />
        {labels.propose}
      </Link>

      {NAV.filter((n) => n.key !== "propose").map(({ key, href, current: isCurrent }) => {
        const current = isCurrent(path);
        const Icon = ICONS[key as Exclude<NavKey, "propose">];
        return (
          <Link
            key={key}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`${item} ${current ? "bg-surface font-bold text-accent" : "text-fg-heading"}`}
          >
            <Icon aria-hidden className="text-[1.375rem]" />
            {labels[key as Exclude<NavKey, "propose">]}
          </Link>
        );
      })}

      {isStaff || isPlatformAdmin ? (
        <>
          <p className="mt-3.5 border-t border-edge ps-3.5 pt-3.5 text-[0.6875rem] font-bold text-fg-muted">{labels.staffSection}</p>
          {isStaff ? (
            <Link href="/app/admin" className={`${item} text-fg-heading`}>
              <ChartIcon aria-hidden className="text-[1.375rem]" />
              {labels.admin}
              {attentionCount ? (
                <span className="ms-auto rounded-full bg-signal px-2 py-0.5 text-[0.6875rem] font-extrabold text-on-signal">
                  <span aria-hidden>{attentionCount}</span>
                  <span className="sr-only">{labels.attention}</span>
                </span>
              ) : null}
            </Link>
          ) : null}
          {isPlatformAdmin ? (
            <Link href="/app/platform" className={`${item} text-fg-heading`}>
              <ChartIcon aria-hidden className="text-[1.375rem]" />
              {labels.platform}
            </Link>
          ) : null}
        </>
      ) : null}
    </nav>
  );
}
