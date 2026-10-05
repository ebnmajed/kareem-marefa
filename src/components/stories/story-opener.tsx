import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { prepareStories } from "@/components/stories/prepare";
import { StoryOpenerClient } from "@/components/stories/story-opener-client";
import type { StorySession } from "@/lib/dal/stories";

// The seam with `sessions` (DEC-251 §4.7): «شاهد القصة» on a live `012` is `sessions'` pill, passed in as `children` —
// a ReactNode crosses the RSC boundary, a closure would not (DEC-159). This SERVER component reads what the viewer
// needs beyond the read model (the media hrefs, the reactions, the capture hint) and renders the client button and
// viewer. `feed`, when given, is the run the viewer moves through after this story (05, §25 silent).

export async function StoryOpener({ story, feed, children, className }: { story: StorySession; feed?: StorySession[]; children: ReactNode; className?: string }) {
  const locale = await getLocale();
  const sessions = feed && feed.some((s) => s.sessionId === story.sessionId) ? feed : [story];
  const index = sessions.findIndex((s) => s.sessionId === story.sessionId);
  const prepared = await prepareStories(locale, sessions);
  return (
    <StoryOpenerClient prepared={prepared} index={index} className={className}>
      {children}
    </StoryOpenerClient>
  );
}
