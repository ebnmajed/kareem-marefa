import "server-only";
import { getStoryReactions, type StoryReactionSummary } from "@/lib/dal/reactions";
import type { StorySession } from "@/lib/dal/stories";
import type { StoryMediaHrefs } from "@/lib/dal/story-frames";

/** The serialisable bundle a story's client receives. */
export interface PreparedStories {
  sessions: StorySession[];
  media: StoryMediaHrefs;
  reactions: Record<string, StoryReactionSummary>;
  canAdd: Record<string, boolean>;
  viewerId: string;
  /** The server's clock at render, for the age line — the client never reads its own for a figure on first paint. */
  now: string;
}

/** Reactions are counts beside a frame, never a gate: a read that fails draws the four at zero, not an error page. */
export async function getReactionsSafe(locale: string, frameIds: string[]): Promise<Record<string, StoryReactionSummary>> {
  try {
    return await getStoryReactions(locale, frameIds);
  } catch {
    return {};
  }
}
