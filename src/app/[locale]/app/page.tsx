import { getTranslations, setRequestLocale } from "next-intl/server";
import { NextForMe } from "@/components/browse/next-for-me";
import { Feed } from "@/components/feed/feed";
import { GameRail } from "@/components/scoring/game-rail";
import { PageFrame } from "@/components/shell/page-frame";

// SCR-010 · /app — HOME IS THE FEED (DEC-205 §2, DEC-206, DEC-207, REQ-UIX-055, STORY-UIX-044).
//
// Its own page: the rings, the week, the feed by day and the propose band (`components/feed/feed.tsx`); on
// desktop the week and «التالية لك» are the game rail, passed to the frame's one slot (contract 1). The
// sessions timeline is `/app/sessions`' alone, the canonical browse URL (REQ-UIX-022); nothing here is it.
//
// The page draws nothing of the shell. Its heading is the screen's name, visually hidden: the artboard names
// the screen by its tab, and a page still has one `<h1>`.
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tWeek] = await Promise.all([getTranslations("feed"), getTranslations("scoring.week")]);
  return (
    <PageFrame
      railLabel={tWeek("railLabel")}
      rail={
        <GameRail locale={locale}>
          <NextForMe locale={locale} />
        </GameRail>
      }
    >
      <h1 className="sr-only">{t("title")}</h1>
      <Feed locale={locale} />
    </PageFrame>
  );
}
