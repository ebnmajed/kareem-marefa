"use client";

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
  return pageOwnsThree ? <MomentWeek {...props} completion={null} pointsNeedsMark={false} /> : <MomentWeek {...props} />;
}
