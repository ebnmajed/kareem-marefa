import { getTranslations, setRequestLocale } from "next-intl/server";
import { BrowseScreen } from "@/components/browse/browse-screen";
import { NextForMe } from "@/components/browse/next-for-me";
import { GameRail } from "@/components/scoring/game-rail";
import { PageFrame } from "@/components/shell/page-frame";

// SCR-011 · /app/sessions — browse, rebuilt in wave 18 from `Browse.dc.html`
// (REQ-UIX-060, STORY-UIX-045, DEC-206 §4.63 – §4.65, DEC-207). The canonical,
// linkable, filterable URL of the sessions (DEC-112, DEC-130): tag chips on an
// event page, the shell's search and every filter control land here, and its
// query string is the filter state (`components/browse/timeline-query.ts`).
//
// Since wave 18 `/app` is the home feed, its own page; the list is this route's
// alone. The page passes the game rail to the frame's one slot (contract 1): at
// `lg` the week and «التالية لك» stand beside the list, as on the home
// (`M10a.md` §0: «browse and the hub use the same frame»).
export default async function SessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("scoring.week");
  return (
    <PageFrame
      railLabel={t("railLabel")}
      rail={
        <GameRail locale={locale}>
          <NextForMe locale={locale} />
        </GameRail>
      }
    >
      <BrowseScreen locale={locale} searchParams={await searchParams} />
    </PageFrame>
  );
}
