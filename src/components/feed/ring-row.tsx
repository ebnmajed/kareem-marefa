import { getTranslations } from "next-intl/server";
import { ringCaption } from "@/components/feed/relative";
import { ringGlyph, type FeedRing } from "@/components/feed/ring-state";
import { StoryRing } from "@/components/ui/story-ring";

// The ring row — `Home.dc.html:27-33`, REQ-UIX-055, DEC-206 §1.5. The sessions in their 24-hour window, each in
// its state by word and by shape. ★ A RING OPENS NOTHING until session stories exist (wave 19): no `onOpen`,
// so `story-ring` draws it as an image named by its label, not a button. No rings, no row.

export async function RingRow({ rings, today, locale }: { rings: FeedRing[]; today: string; locale: string }) {
  if (rings.length === 0) return null;
  const t = await getTranslations("feed");
  return (
    <ul aria-label={t("rings.label")} className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {rings.map((ring) => {
        const state = t(`rings.state.${ring.state}`);
        const caption = ringCaption(ring.state, ring.day, today, t, locale);
        return (
          <li key={ring.sessionId} className="shrink-0">
            <StoryRing
              state={ring.state}
              label={t("rings.name", { title: ring.title, state, caption })}
              stateLabel={state}
              glyph={ringGlyph(ring.companyName, ring.title)}
              caption={caption}
              teamColor={ring.teamColor}
            />
          </li>
        );
      })}
    </ul>
  );
}
