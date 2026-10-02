"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MomentWeek, type MomentWeekProps } from "@/components/scoring/moment-week";

// The band's moments, minus the one a page plays itself (wave 20, DEC-195 «once per occurrence», the lead's ruling
// after the PR A gate). scoring's file.
//
// ★ ONE OCCURRENCE, ONE MOMENT, ONE SURFACE. On `/app/me/points` the page carries its own head with moment 3 (and 4),
// and from `lg` the band sits beside it, visible too: two count-ups of the same «+120» would be the moment played
// twice. So where the page has its own head, the band draws moment 3's STATIC state — the figure, the «+N» — and
// neither claims the occurrence nor acknowledges it; the head plays and acknowledges. The layout cannot pass the
// path (it does not re-render on navigation), so the band reads it here, in the client, where it is current.
// Moment 5 (the week's rank) is the band's alone and is untouched.

const PAGES_WITH_THEIR_OWN_HEAD = [/\/app\/me\/points$/];

export function BandMoments(props: MomentWeekProps) {
  const path = usePathname() ?? "";
  const pageOwnsThree = PAGES_WITH_THEIR_OWN_HEAD.some((re) => re.test(path));
  // ★ Once it has yielded, the band's moment-3 props are stale for the rest of this layout's life (a layout does not
  // re-render on navigation): the head has played and written the mark. Coming back to `/app/me`, it must neither play
  // the occurrence again nor write its own, older mark over the head's — that mark passes the level LAST SEEN through
  // (DEC-207 §1.3) and would turn the level card back.
  const [yielded, setYielded] = useState(false);
  if (pageOwnsThree && !yielded) setYielded(true); // React's own pattern for state derived from a changing prop

  // ★ A KEY PER MODE (the PR B gate, desktop): the band lives in the layout and persists across the in-app step to a
  // page with its own head. Kept mounted, its controller would go on advertising the completion's key in
  // `data-moment-keys` — and the head reads a visible key as «painted by the server» and stays silent, writing no mark,
  // so «+N» would greet the member on every visit. Remounting on the switch drops the old controller (and its claim on
  // the painted set, `use-seen-moment.ts`), so the head meets the occurrence as a first sight, plays it once and
  // acknowledges it.
  return pageOwnsThree || yielded ? (
    <MomentWeek key="yields-three" {...props} completion={null} pointsNeedsMark={false} />
  ) : (
    <MomentWeek key="plays-three" {...props} />
  );
}
