"use server";

import { markBoardSeen, type BoardMark } from "@/lib/dal/leaderboards";
import { markPointsSeen, type PointsMark } from "@/lib/dal/points";

// The week's two Server Actions (wave 18, REQ-UIX-055, DEC-206 §5, DEC-207 §1.3). The home tells the server
// what the member has SEEN on the week, once the moment the client showed is done — the same two writers
// `SCR-022` and the boards use, so one mark serves both surfaces. Bound on the server with the locale and the
// mark the page rendered: the client sends nothing of its own. ★ The points mark carries the level LAST SEEN,
// which `getMemberWeek()` put there, so moment 4 stays `SCR-022`'s. No revalidation.

export async function acknowledgeWeekPoints(locale: string, mark: PointsMark): Promise<void> {
  await markPointsSeen(locale, mark);
}

export async function acknowledgeWeekRank(locale: string, mark: BoardMark): Promise<void> {
  await markBoardSeen(locale, mark);
}
