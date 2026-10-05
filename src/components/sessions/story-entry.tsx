import { getTranslations } from "next-intl/server";
import { StoryOpener } from "@/components/stories/story-opener";
import { Badge } from "@/components/ui/badge";
import type { StorySession } from "@/lib/dal/stories";

// «شاهد القصة» on a live `012` (REQ-STO-008, DEC-251 §4.7) — `EventLive.dc.html:21`'s pill: the live mark, then the
// words. It opens `content`'s viewer through `StoryOpener`, whose button this content becomes; the viewer, its focus
// and its return are `content`'s. Drawn only for a story the feed returned — a live session with a frame I may see —
// so a cancelled or empty story has no entry, by the DAL and never by this file (REQ-STO-018).
export async function StoryEntry({ story }: { story: StorySession }) {
  const t = await getTranslations("sessions.event");
  return (
    <StoryOpener
      story={story}
      className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-edge bg-surface py-1.5 ps-1.5 pe-3 text-caption font-bold text-fg-heading"
    >
      <Badge tone="live" size="sm">
        {t("storyLive")}
      </Badge>
      <span>{t("storyWatch")}</span>
    </StoryOpener>
  );
}
