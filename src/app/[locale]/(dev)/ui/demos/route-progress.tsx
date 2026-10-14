"use client";

import { Logo } from "@/components/brand/logo";
import { Link } from "@/components/ui/link";
import { usePendingLongerThan } from "@/components/ui/route-progress";
import type { DemoGround } from "../ground";

// The gallery's `route-progress` demo — wave 17, contract 3 (DEC-199 §3); DEC-288.
//
// ★ THE WAIT, AS THE APP DRAWS IT. No bar any more (DEC-288): a house link feeds the store, its dot appears beside it
// while the navigation is pending, and the mark breathes from the moment it is (the app waits 400 ms first; the demo
// does not, so the gallery spec can stall the link and capture it).
export function RouteProgressDemo({ ground }: { ground: DemoGround }) {
  const waiting = usePendingLongerThan(0);
  return (
    <div data-demo="route-progress" data-ground={ground} className="flex items-center gap-4">
      <Logo height={34} label={null} motion={waiting ? "loading" : "none"} />
      <p className="text-body text-fg-heading">
        <Link href="/ui?from=route-progress" className="underline underline-offset-4">
          انتقل
        </Link>
      </p>
    </div>
  );
}
