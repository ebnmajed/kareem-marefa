"use client";

import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { usePendingLongerThan } from "@/components/ui/route-progress";
import { isAdminConsole, isFullScreen, ownsTopRow } from "@/components/shell/shell-routes";

// The wait, where the shell's own mark is not on screen — DEC-288, REQ-UIX-006, REQ-UIX-119. The lead's.
//
// ★ THE MARK IS THE ONE WAIT SIGNAL. No skeleton and no bar: while a navigation has been pending for more than
// 400 ms the app bar's mark breathes (`home-mark.tsx`). But on a phone the event page, the hub, the boards and the
// rest draw their own top row and the shell's bar is not displayed below `lg` (`ownsTopRow`), and the viewer has no
// bar at any width — so on those routes this draws the same mark, breathing, at the top of the screen, for exactly
// as long as the app waits. Where the shell's bar is shown, it draws nothing: one mark, never two.
// ★ The console and the platform are the sober register (REQ-UIX-053): their mark never animates, so nothing here.
// ★ `aria-hidden`: it says nothing a link's own pending state does not already say. Under reduced motion it is the
// still mark (`logo.tsx`).
export function RouteWait() {
  const pathname = usePathname();
  const waiting = usePendingLongerThan(400);
  if (!waiting || isAdminConsole(pathname)) return null;
  const full = isFullScreen(pathname);
  if (!full && !ownsTopRow(pathname)) return null;
  return (
    <div
      aria-hidden="true"
      data-route-wait=""
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))] ${full ? "" : "lg:hidden"}`}
    >
      <Logo height={34} label={null} motion="loading" />
    </div>
  );
}
