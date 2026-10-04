import "server-only";
import { getReactionsSafe, type PreparedStories } from "@/components/stories/prepared";
import { sessionClient } from "@/lib/dal/session";
import type { StorySession } from "@/lib/dal/stories";
import { canAddToStory, getStoryMediaHrefs } from "@/lib/dal/story-frames";

// What the viewer needs beyond `sessions'` read model, read once on the server: the media hrefs (`content`'s to sign
// from the ids `stories.ts` hands over, DEC-251 §4), the reactions, the capture gate's hint, and who is looking — so
// an author is not offered «بلّغ» on their own frame. Nothing here filters a frame: expiry, visibility and
// cancellation are `story_feed()`'s and RLS's (contract 4).

export async function prepareStories(locale: string, sessions: StorySession[]): Promise<PreparedStories> {
  const photoIds: string[] = [];
  const videoFrameIds: string[] = [];
  const frameIds: string[] = [];
  for (const s of sessions) {
    for (const f of s.frames) {
      frameIds.push(f.id);
      if (f.kind === "photo") photoIds.push(f.photoId);
      if (f.kind === "recap") photoIds.push(...f.photoIds);
      if (f.kind === "video") videoFrameIds.push(f.id);
    }
  }
  const { session } = await sessionClient(locale);
  const [media, reactions, canAdd] = await Promise.all([
    getStoryMediaHrefs(locale, { photoIds, videoFrameIds }),
    getReactionsSafe(locale, frameIds),
    canAddToStory(locale, sessions.map((s) => s.sessionId)),
  ]);
  return { sessions, media, reactions, canAdd, viewerId: session.memberId, now: new Date().toISOString() };
}
