"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { CalendarIcon, PlusIcon, UserIcon } from "@/components/ui/icons";
import { isImmersive } from "@/components/shell/shell-routes";

// The phone tab bar — `16` §6.1 note 2, DEC-072, DEC-098, REQ-UIX-002.
//
// It replaces the `<details>` disclosure that held both consoles and sign-out
// behind one «المزيد» summary. The current shell shows THREE items on a phone
// and eight on a desktop, and the disclosure is where everything else went.
//
// ★★ IT IS CONTEXTUAL, NOT UNIVERSAL. On detail and immersive screens — the
// event page, check-in, the host view, the materials viewer, the studio — it
// is absent, and from M10 a bottom ACTION bar carrying that screen's one
// primary action takes its place. Three reasons, and the third is the one that
// matters:
//
//   · a universal tab bar plus a sticky action card is TWO fixed bottom bars
//     on one screen, and §17's gate asserts there is never more than one;
//   · navigation is not what a member came to a detail screen to do;
//   · it is a better answer to REQ-SES-013 than the first draft's in-flow
//     card — a member who scrolls past an in-flow card has no route back to
//     «احجز مقعدًا» on the one screen where the requirement demands
//     reachability, and a bottom bar is reachable at every scroll position.
//
// ★ The decision is made from `usePathname()` in this client component, and so is
// `<main>`'s (`shell-frame.tsx`). It was made on the server from `x-pathname`, which a
// layout never re-reads on a client-side navigation — see `shell-routes.ts`.
//
// It adds `env(safe-area-inset-bottom)` to its own padding — the standing rule
// from the mobile pass — and `<main>` gains a matching `padding-block-end` IN
// THE SAME COMMIT, because `app/layout.tsx` had none and a fixed bottom bar
// covers the last ~64 px of all 49 screens ever written at once.

export interface TabBarProps {
  labels: { nav: string; sessions: string; propose: string; me: string };
}

// ★ THREE TABS, NOT FOUR (DEC-130). `/app` IS the sessions timeline (DEC-112),
// the same component `/app/sessions` renders, so «الرئيسية» and «الجلسات» had
// become two names for one destination — exactly what DEC-112 forbade. One tab,
// current on both routes. The event page under `/app/sessions/[id]` has no tab
// bar at all (IMMERSIVE above), so the prefix test cannot misfire there.
const TABS = [
  { href: "/app", key: "sessions", Icon: CalendarIcon, current: (p: string) => p === "/app" || p === "/app/sessions" || p.startsWith("/app/sessions?") },
  { href: "/app/propose", key: "propose", Icon: PlusIcon, current: (p: string) => p.startsWith("/app/propose") },
  { href: "/app/me", key: "me", Icon: UserIcon, current: (p: string) => p.startsWith("/app/me") },
] as const;

export function TabBar({ labels }: TabBarProps) {
  const pathname = usePathname();
  if (isImmersive(pathname)) return null;
  const withoutLocale = (pathname ?? "").replace(/^\/(ar|en)(?=\/|$)/, "");

  return (
    <nav
      aria-label={labels.nav}
      // `--tabbar-h` is declared in globals.css and consumed BY THE BAR, so a
      // height change moves one number and the scroll padding follows it.
      // ★ `start-0 end-0`, not `inset-inline-0`: Tailwind 4 has no
      // `inset-inline-*` utility, so that class compiled to NOTHING and this fixed
      // bar had no inline edges — it shrink-wrapped its tabs instead of spanning
      // the screen, which is the owner's «icons aren't correctly positioned»
      // (DEC-111, DEC-133). `tests/unit/logical-utilities.test.ts` now refuses it.
      className="fixed start-0 end-0 bottom-0 z-30 border-t border-edge bg-canvas md:hidden"
      style={{ paddingBlockEnd: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-6xl items-stretch justify-around">
        {TABS.map(({ href, key, Icon, current: isCurrent }) => {
          const current = isCurrent(withoutLocale);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 px-1 ${
                  current ? "text-fg-heading" : "text-fg-muted"
                }`}
              >
                {/* ★ The dot is ABSOLUTE, so it costs no layout height. The
                    390 px review is what found this: with the dot in flow, the
                    icon, the label and the dot did not fit in 64 px and the
                    labels collided with their neighbours. An active tab is a
                    dot (DEC-079 condition 2) — it just is not a row. */}
                <span
                  aria-hidden
                  className={`absolute top-1.5 block h-1 w-1 rounded-full ${current ? "bg-fg-heading" : "bg-transparent"}`}
                />
                <Icon className="text-[1.375rem]" />
                {/* ★ An explicit size, not `text-caption`: Arabic caption is
                    15 px, which does not fit four labels across 390 px. 12 px
                    with `leading-tight` does, on ONE line — and one line is the
                    requirement, because the alternative is `overflow: hidden`,
                    which clips tashkeel (`10` §1). The labels are short for the
                    same reason: «اقترح» here, «اقترح جلسة» everywhere else. */}
                <span className="text-[0.75rem] leading-tight">{labels[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
