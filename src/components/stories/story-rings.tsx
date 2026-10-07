import { getLocale } from "next-intl/server";
import { prepareStories } from "@/components/stories/prepare";
import { StoryRingsClient } from "@/components/stories/story-rings-client";
import { getStoryFeed } from "@/lib/dal/stories";
import { listStoryCaptureSessions } from "@/lib/dal/story-frames";

// The ring row on `010` — `sessions'` story feed, wired at last (REQ-STO-006, REQ-STO-007, DEC-251 §4.5). Five waves
// drew it inert; from here a ring is a button that opens the viewer. The order, the states and which sessions have a
// ring are `story_feed()`'s and RLS's — nothing is filtered here (contract 4). No rings, no row.

// ★ ONE SOURCE FAILING DOES NOT TAKE THE HOME WITH IT (`feed.ts`'s rule): a story feed that cannot be read draws no
// ring row, and the rest of the home stands.
export async function StoryRings() {
  const locale = await getLocale();
  let prepared;
  let capture: { sessionId: string; title: string }[] = [];
  try {
    // ★ DEC-278: «أضف قصتك» leads the row whenever the member may add to a session's story — even one with no frame yet,
    // which has no ring of its own. A capture list that cannot be read only hides the entry.
    const [feed, sessions] = await Promise.all([getStoryFeed(locale), listStoryCaptureSessions(locale).catch(() => [])]);
    capture = sessions;
    if (feed.sessions.length === 0 && capture.length === 0) return null;
    prepared = await prepareStories(locale, feed.sessions);
  } catch (e) {
    console.error("story rings:", e instanceof Error ? e.message : e);
    return null;
  }
  return <StoryRingsClient prepared={prepared} capture={capture} />;
}
