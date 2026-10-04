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

// ─── wave 26 — a reaction on a story frame (REQ-STO-005, DEC-251 §5) ───────────────────────────────────────────
// Its own table, `story_reactions`, never `reactions`: one row per member per FRAME (choosing another replaces it),
// four kinds, no broadcast. Worth nothing, always — no trigger and no catalogue entry writes a ledger row for it
// (REQ-EVT-004, REQ-PTS-010). The policies are the authority: your own row, on a frame you may see now.

export const STORY_REACTION_KINDS = ["heart", "fire", "clap", "idea"] as const;
export type StoryReactionKind = (typeof STORY_REACTION_KINDS)[number];
const storyReactionKind = z.enum(STORY_REACTION_KINDS);

/** Sets the viewer's one reaction on a frame, replaces it, or (with null) removes it. */
export async function setStoryReaction(locale: string, frameId: string, kind: StoryReactionKind | null): Promise<StoryReactionKind | null> {
  const id = z.uuid().parse(frameId);
  const { session, supabase } = await sessionClient(locale);
  if (kind === null) {
    const { error } = await supabase.from("story_reactions").delete().eq("frame_id", id).eq("member_id", session.memberId);
    if (error) throw new Error(`story_reactions: ${error.message}`);
    return null;
  }
  const parsed = storyReactionKind.parse(kind);
  const { error } = await supabase
    .from("story_reactions")
    .upsert({ org_id: session.orgId, frame_id: id, member_id: session.memberId, kind: parsed, updated_at: new Date().toISOString() }, { onConflict: "frame_id,member_id" });
  if (error) throw new Error(`story_reactions: ${error.message}`);
  return parsed;
}

export interface StoryReactionSummary {
  totals: Record<StoryReactionKind, number>;
  mine: StoryReactionKind | null;
}

/** The counts on a page of frames and the viewer's own choice — through the select policy, so a frame the viewer may
 *  not see contributes nothing. */
export async function getStoryReactions(locale: string, frameIds: string[]): Promise<Record<string, StoryReactionSummary>> {
  const ids = [...new Set(frameIds)].filter((id) => z.uuid().safeParse(id).success);
  if (ids.length === 0) return {};
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("story_reactions").select("frame_id, member_id, kind").in("frame_id", ids);
  if (error) throw new Error(`story_reactions: ${error.message}`);
  const out: Record<string, StoryReactionSummary> = {};
  for (const id of ids) out[id] = { totals: { heart: 0, fire: 0, clap: 0, idea: 0 }, mine: null };
  for (const r of data ?? []) {
    const entry = out[r.frame_id as string];
    const k = r.kind as StoryReactionKind;
    if (!entry || !(k in entry.totals)) continue;
    entry.totals[k] += 1;
    if (r.member_id === session.memberId) entry.mine = k;
  }
  return out;
}
