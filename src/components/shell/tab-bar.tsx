"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { switchKind } from "@/lib/ui/nav-motion";
import { CalendarIcon, HomeIcon, PlusIcon, TrophyIcon, UserIcon } from "@/components/ui/icons";
import { NAV, type NavKey } from "@/components/shell/nav-items";
import { isAdminConsole, isImmersive, shellPath } from "@/components/shell/shell-routes";

// The phone's bottom bar — REBUILT from `docs/design/screens/m10a/Home.dc.html`
// (REQ-UIX-054, DEC-205 §2, DEC-206 §4.30): FIVE tabs — الرئيسية · الجلسات ·
// اقترح · الترتيب · حسابي — the third a raised accent circle that stands above
// the bar. It was three (DEC-130), when `/app` was the sessions list; home is
// the feed now, so «الرئيسية» and «الجلسات» are two destinations again.
//
// It hides on immersive routes exactly as before (`shell-routes.ts`), where the
// screen's own bottom action bar takes its place: never two fixed bars.
//
// ★ Below `lg`, not below `md`: the navigation rail replaces it from `lg`, and
// a tablet between the two has neither unless the bar stays.
//
// The height is `--tabbar-h` in globals.css, read by `<main>`'s padding and the
// scroll padding; the raised circle overhangs it and covers no content, because
// what it overhangs is the page's own bottom padding.

export interface TabBarProps {
  labels: { nav: string } & Record<NavKey, string> & { proposeFull: string };
}

const ICONS: Record<NavKey, typeof HomeIcon> = {
  home: HomeIcon,
  sessions: CalendarIcon,
  propose: PlusIcon,
  board: TrophyIcon,
  me: UserIcon,
};

export function TabBar({ labels }: TabBarProps) {
  const pathname = usePathname();
  // ★ wave 21 (REQ-UIX-084): no tab bar in the org console, at any width (`AdminSessionsPhone.dc.html`).
  if (isImmersive(pathname) || isAdminConsole(pathname)) return null;
  const path = shellPath(pathname);

  return (
    <nav
      data-tab-bar
      aria-label={labels.nav}
      className="fixed start-0 end-0 bottom-0 z-30 border-t border-edge bg-surface lg:hidden"
      style={{ paddingBlockEnd: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex h-20 max-w-xl items-end justify-around px-2 pb-3.5">
        {NAV.map(({ key, href, current: isCurrent }, index) => {
          const current = isCurrent(path);
          // ★ Wave 29 (REQ-UIX-121, REQ-UIX-125): each tab presses, and its content arrives from its own side.
          const nav = switchKind(index, NAV.findIndex((n) => n.current(path)));
          const Icon = ICONS[key];
          if (key === "propose") {
            return (
              <li key={key} className="flex w-[62px] justify-center self-start">
                <Link
                  href={href}
                  data-nav-kind={nav}
                  data-press=""
                  aria-label={labels.proposeFull}
                  aria-current={current ? "page" : undefined}
                  className={`-mt-[18px] inline-flex size-14 items-center justify-center rounded-full focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)] ${
                    // ★ wave 19 (DEC-213 §3.3): current is bone with the muted drop (`Propose.dc.html`) — the raised tab
                    // has no «active» colour of its own, so it was the same current or not.
                    current
                      ? "bg-fg-heading text-canvas shadow-[0_5px_0_var(--fg-muted),0_0_0_5px_var(--bg)]"
                      : "bg-accent text-on-accent shadow-[0_5px_0_var(--accent-deep),0_0_0_5px_var(--bg)]"
                  }`}
                >
                  <PlusIcon aria-hidden data-nav-jump-icon="" className="text-[1.75rem]" />
                </Link>
              </li>
            );
          }
          return (
            <li key={key} className="w-[62px]">
              <Link
                href={href}
                data-nav-kind={nav}
                data-press=""
                aria-current={current ? "page" : undefined}
                className={`relative flex min-h-11 flex-col items-center gap-[3px] py-1.5 text-[0.6875rem] leading-tight font-bold ${
                  current ? "text-accent" : "text-fg-muted"
                }`}
              >
                {/* More than colour marks the current tab (REQ-UIX-054): a dot above
                    it, absolute so it costs no height. */}
                <span aria-hidden className={`absolute -top-0.5 block size-1 rounded-full ${current ? "bg-accent" : "bg-transparent"}`} />
                <Icon aria-hidden data-nav-jump-icon="" className="text-[1.5rem]" />
                <span>{labels[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
