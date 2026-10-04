import { getLocale } from "next-intl/server";
import { prepareStories } from "@/components/stories/prepare";
import { StoryRingsClient } from "@/components/stories/story-rings-client";
import { getStoryFeed } from "@/lib/dal/stories";

// The ring row on `010` — `sessions'` story feed, wired at last (REQ-STO-006, REQ-STO-007, DEC-251 §4.5). Five waves
// drew it inert; from here a ring is a button that opens the viewer. The order, the states and which sessions have a
// ring are `story_feed()`'s and RLS's — nothing is filtered here (contract 4). No rings, no row.

export async function StoryRings() {
  const locale = await getLocale();
  const feed = await getStoryFeed(locale);
  if (feed.sessions.length === 0) return null;
  const prepared = await prepareStories(locale, feed.sessions);
  return <StoryRingsClient prepared={prepared} />;
}
