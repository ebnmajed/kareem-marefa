import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Reactions (REQ-EVT-004): worth zero points, always — that is enforced by
// `reactions` simply not existing in the scoring catalogue (05, scoring's
// table), nothing here. The write policies already are the whole authority
// boundary (0010, p3_self_insert/p3_self_delete: only your own row, a
// duplicate (member, target, kind) is a unique-index conflict) — this
// module is a toggle over them plus the initial-paint totals (the realtime
// broadcast, 03 §7.4, only carries totals AFTER the first click).

const reactionKind = z.string().regex(/^[a-z_]{1,32}$/);

export type ReactionTarget = { commentId: string; sessionId?: undefined } | { sessionId: string; commentId?: undefined };

function targetColumn(target: ReactionTarget): { column: "comment_id" | "session_id"; value: string } {
  return "commentId" in target && target.commentId ? { column: "comment_id", value: target.commentId } : { column: "session_id", value: target.sessionId as string };
}

/** Adds the viewer's reaction if absent, removes it if present — one click, one state. */
export async function toggleReaction(locale: string, target: ReactionTarget, kind: string): Promise<"added" | "removed"> {
  const parsedKind = reactionKind.parse(kind);
  const { column, value } = targetColumn(target);
  if (!z.uuid().safeParse(value).success) throw new Error("invalid_target");
  const { session, supabase } = await sessionClient(locale);

  const { data: existing, error: selectError } = await supabase
    .from("reactions")
    .select("id")
    .eq(column, value)
    .eq("member_id", session.memberId)
    .eq("kind", parsedKind)
    .maybeSingle();
  if (selectError) throw new Error(`reactions: ${selectError.message}`);

  if (existing) {
    const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
    if (error) throw new Error(`reactions: ${error.message}`);
    return "removed";
  }

  const { error } = await supabase.from("reactions").insert({ org_id: session.orgId, member_id: session.memberId, kind: parsedKind, [column]: value });
  if (error) throw new Error(error.code === "23505" ? "already_reacted" : `reactions: ${error.message}`);
  return "added";
}

export interface ReactionSummary {
  totals: Record<string, number>;
  /** Kinds the viewer has already used on this target, for the toggle's initial state. */
  mine: string[];
}

/** Initial-paint totals for a page of comments — the realtime channel keeps
 *  them live after that (03 §7.4, `reactions_broadcast()`). */
export async function getReactionTotalsForComments(locale: string, commentIds: string[]): Promise<Record<string, ReactionSummary>> {
  if (commentIds.length === 0) return {};
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("reactions").select("comment_id, member_id, kind").in("comment_id", commentIds);
  if (error) throw new Error(`reactions: ${error.message}`);

  const out: Record<string, ReactionSummary> = {};
  for (const row of data ?? []) {
    const id = row.comment_id as string;
    const bucket = (out[id] ??= { totals: {}, mine: [] });
    bucket.totals[row.kind] = (bucket.totals[row.kind] ?? 0) + 1;
    if (row.member_id === session.memberId) bucket.mine.push(row.kind);
  }
  return out;
}
