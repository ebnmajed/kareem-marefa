"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { hasActionBar, hasNavRail, isAdminConsole, isEventPage, isFullScreen, isImmersive } from "@/components/shell/shell-routes";

// The shell's frame (REQ-UIX-054, contract 1 of wave 18).
//
// A layout does not re-render on navigation (Partial Rendering), so what a ROUTE
// changes about the frame — the rail, the padding, the width — is decided here,
// in the client, from the path.
//
//   · a member route: from `lg`, the navigation rail (220 px) and the content
//     beside it in a 1280 container; below `lg`, one column that clears the tab bar;
//   · the event page: full bleed — it owns its band and its width;
//   · the console and the other immersive routes: the container they had.
//
// ★ A PAGE RENDERS ITS CONTENT AND NOTHING OF THE SHELL. A page with a game rail
// wraps itself in `<PageFrame rail={…}>` (`page-frame.tsx`), which is the one slot.
//
// `data-frame` names which of the three a route got — `member`, `bleed`, `plain` — so a
// test asks for the frame and not for a class that happens to draw it.
//
// Nothing here is transformed, filtered or clipped: the root scope is the
// ancestor of every screen (DEC-188 §5), and the rail is sticky.

// `--tabbar-h` is the bar's height while a fixed bottom bar is on the page, and zero
// where none is (globals.css).
const CLEARS_BAR = { paddingBlockEnd: "calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 1rem)" } as const;

function useShellRoute() {
  const pathname = usePathname();
  // ★ wave 19 (DEC-213 §3.1): the viewer is full-screen, so it is full bleed too.
  const fullScreen = isFullScreen(pathname);
  const fullBleed = isEventPage(pathname) || fullScreen;
  const adminConsole = isAdminConsole(pathname);
  return {
    fullScreen,
    fullBleed,
    adminConsole,
    framed: hasNavRail(pathname),
    clearsBottomBar: !adminConsole && (!isImmersive(pathname) || hasActionBar(pathname)),
  };
}

export function ShellMain({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  const { fullBleed, framed, clearsBottomBar, adminConsole } = useShellRoute();
  const style = clearsBottomBar ? CLEARS_BAR : undefined;

  // ★ wave 21 (REQ-UIX-084): the org console's layout draws its bar, its rail and its padding — the frame gives it the
  // whole width and nothing else.
  if (adminConsole) {
    return (
      <main id="main" data-frame="console">
        {children}
      </main>
    );
  }

  if (framed) {
    return (
      <div className="mx-auto flex max-w-[1280px] gap-6 lg:px-6 lg:pt-6">
        {rail}
        <main id="main" data-frame="member" className="min-w-0 flex-1 px-3 pt-2 lg:px-0 lg:pt-0" style={style}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <main id="main" data-frame={fullBleed ? "bleed" : "plain"} className={fullBleed ? undefined : "mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12"} style={style}>
      {children}
    </main>
  );
}

export function ShellFooter({ children }: { children: ReactNode }) {
  const { fullScreen, framed, clearsBottomBar, adminConsole } = useShellRoute();
  // ★ wave 21: the console draws no footer (`AdminDashboard.dc.html`); the legal pages stay one link away in the app.
  if (fullScreen || adminConsole) return null;
  return (
    <footer
      className={`mx-auto px-4 pb-10 pt-4 text-body-sm text-fg-muted ${framed ? "max-w-[1280px] lg:ps-[268px] lg:pe-6" : "max-w-6xl md:px-8"}`}
      style={clearsBottomBar ? CLEARS_BAR : undefined}
    >
      {children}
    </footer>
  );
}
