"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isFullScreen, ownsTopRow } from "@/components/shell/shell-routes";

// The shell's sticky top bar (REQ-UIX-054). A client wrapper only so a ROUTE can decide
// something about it after a client-side navigation — a layout is not re-rendered then.
// What it decides: on a route that draws its own phone top row (`ownsTopRow`, DEC-207 Q2),
// the bar is not displayed below `lg`. Its content stays the server's.
export function ShellHeader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const own = ownsTopRow(pathname);
  // ★ wave 19 (DEC-213 §3.1): the viewer is full-screen — no bar at any width.
  if (isFullScreen(pathname)) return null;
  return (
    <header data-own-top-row={own ? "" : undefined} className={`sticky top-0 z-30 border-b border-edge bg-canvas ${own ? "max-lg:hidden" : ""}`}>
      {children}
    </header>
  );
}
