"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isEventPage, isImmersive } from "@/components/shell/shell-routes";

// `<main>` and the footer, which must agree with the tab bar about the bottom bar.
//
// ★★ THE PADDING SHIPS WITH THE BAR (`16` §3.1): a fixed, safe-area-padded bottom bar
// covers the last ~64 px of every screen unless `<main>` clears it. The event page owns
// its full-bleed band and its own container, and clears its bottom ACTION bar exactly as
// other screens clear the tab bar — `--tabbar-h` carries whichever bar exists.

const CLEARS_BAR = { paddingBlockEnd: "calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 1rem)" } as const;

function useShellRoute() {
  const pathname = usePathname();
  const fullBleed = isEventPage(pathname);
  return { fullBleed, clearsBottomBar: !isImmersive(pathname) || fullBleed };
}

export function ShellMain({ children }: { children: ReactNode }) {
  const { fullBleed, clearsBottomBar } = useShellRoute();
  return (
    <main id="main" className={fullBleed ? undefined : "mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12"} style={clearsBottomBar ? CLEARS_BAR : undefined}>
      {children}
    </main>
  );
}

export function ShellFooter({ children }: { children: ReactNode }) {
  const { clearsBottomBar } = useShellRoute();
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-body-sm text-fg-muted md:px-8" style={clearsBottomBar ? CLEARS_BAR : undefined}>
      {children}
    </footer>
  );
}
