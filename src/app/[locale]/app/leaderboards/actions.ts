"use server";

import { markBoardSeen, type BoardMark } from "@/lib/dal/leaderboards";

// SCR-027 / SCR-028's one Server Action (wave 16, contract 5, DEC-195 §2.6): a board
// tells the server what rank the member has SEEN, once its moment is done. Bound on the
// server with the locale and the board's mark; the DAL validates, the SQL writes the
// caller's own row only. No revalidation.
export async function acknowledgeBoardSeen(locale: string, mark: BoardMark): Promise<void> {
  await markBoardSeen(locale, mark);
}
