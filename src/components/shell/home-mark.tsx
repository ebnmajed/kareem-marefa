"use client";

import { Logo } from "@/components/brand/logo";
import { usePendingLongerThan } from "@/components/ui/route-progress";

// The app bar's mark — REQ-UIX-119, REQ-UIX-120. The lead's.
//
// It is the home control, so it has two of the mark's three moves and never the third:
//   · pressed, it settles once (`tap` — CSS, on the link's `:active`);
//   · while the app has been waiting on a navigation for more than 400 ms, its four faces breathe (`loading`),
//     and stop the moment the page lands. Below 400 ms nothing moves: a wait that short is not a wait.
// The reveal is sign-in's and the landing's, never the shell's — a layout keeps this mounted, and a mark that
// re-drew itself on every screen would be a sixth moment (DEC-183 §2).
// ★ Under reduced motion both are the still mark; the keyframes are declared only where motion is welcome.
// ★ It must stay the DIRECT child of its link: the settle is `:active > [data-logo]`.
export function HomeMark({ height }: { height: number }) {
  const waiting = usePendingLongerThan(400);
  return <Logo height={height} label={null} motion={waiting ? "loading" : "tap"} />;
}
