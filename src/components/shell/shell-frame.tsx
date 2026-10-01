"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { hasNavRail, isEventPage, isImmersive } from "@/components/shell/shell-routes";

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
  const fullBleed = isEventPage(pathname);
  return { fullBleed, framed: hasNavRail(pathname), clearsBottomBar: !isImmersive(pathname) || fullBleed };
}

export function ShellMain({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  const { fullBleed, framed, clearsBottomBar } = useShellRoute();
  const style = clearsBottomBar ? CLEARS_BAR : undefined;

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
  const { framed, clearsBottomBar } = useShellRoute();
  return (
    <footer
      className={`mx-auto px-4 pb-10 pt-4 text-body-sm text-fg-muted ${framed ? "max-w-[1280px] lg:ps-[268px] lg:pe-6" : "max-w-6xl md:px-8"}`}
      style={clearsBottomBar ? CLEARS_BAR : undefined}
    >
      {children}
    </footer>
  );
}
