"use server";

import { markPointsSeen, type PointsMark } from "@/lib/dal/points";

// SCR-022's one Server Action (wave 16, contract 5, DEC-195 §2.6): the head tells the
// server what the member has SEEN, once the moment the client showed is done. It is
// bound on the server with the locale and the mark the page rendered, so the client
// sends nothing of its own; the DAL validates the shape and the SQL writes the
// caller's own row only. No revalidation — nothing on the page changes because of it.
export async function acknowledgePointsSeen(locale: string, mark: PointsMark): Promise<void> {
  await markPointsSeen(locale, mark);
}
