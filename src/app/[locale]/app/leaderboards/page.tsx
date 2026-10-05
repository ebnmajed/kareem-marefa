import { getTranslations, setRequestLocale } from "next-intl/server";
import { BoardTopRow } from "@/components/scoring/board-top-row";
import { CompanyBoard } from "@/components/scoring/company-board";
import { CompanyPointsBreakdownSection } from "@/components/scoring/company-points-breakdown";
import { CupCard } from "@/components/scoring/cup-card";
import { isDocumentLoad } from "@/components/scoring/document-load";
import { formatDateTime } from "@/components/sessions/numerals";
import { BOARD_MORE, BOARD_SHOWN, MemberBoard } from "@/components/scoring/member-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { Tabs } from "@/components/ui/tabs";
import {
  boardPlace,
  getBoardMoment,
  getCompanyCup,
  getCompanyPointsBreakdown,
  getLeaderboards,
  getTopicBoard,
  getWeeklyBoard,
  getWeekStanding,
  listBoardCategories,
  type BoardMoment,
  type MemberBoardRow,
} from "@/lib/dal/leaderboards";
import { acknowledgeBoardSeen } from "./actions";

// SCR-027 · SCR-028 · /app/leaderboards — written from `docs/design/screens/m10c/Board.dc.html` and
// `Companies.dc.html` in wave 20 (PR B), after the old page and its components were deleted (DEC-208); the
// kept-behaviour tables are §2.3 and §2.4 of `docs/plan/notes/scoring.md`'s wave-20 plan. `REQ-UIX-078`, `REQ-UIX-079`.
//
// ★ FOUR WINDOWS AS LINKED TABS — `?board=week` (★ the default, REQ-UIX-078), `?board=month`, `?board=all`,
// `?board=companies` — each a URL the server renders on its own (`ui/tabs` in its navigation mode). The week is summed
// live (0171); the month and the company race read the newest snapshot of their own PERIOD; all time is live; the
// company race is the QUARTER's cup (DEC-219 §2 as corrected), falling back to the month's race while no quarter has
// been taken (`main`'s worker before the merge).
// ★ The category menu (REQ-LDR-003) sits in the header on «كل الأوقات», the one window with per-category boards — the
// topic snapshots are all-time (scoring's plan, D30). `?category=<id>`.
// ★ The movement is «منذ زيارتك الأخيرة», per window, against the viewer's own seen mark (0162, 0169); the mark is
// bound here, so the client sends nothing of its own. The data is read at the data (`requireSession()`).

type Board = "week" | "month" | "all" | "companies";

function boardFrom(value: string | undefined): Board {
  return value === "month" || value === "all" || value === "companies" ? value : "week";
}

export default async function LeaderboardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ board?: string; rows?: string; category?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const board = boardFrom(query.board);
  const limit = query.rows === String(BOARD_MORE) ? BOARD_MORE : BOARD_SHOWN;

  const [t, boards, documentLoad, standing] = await Promise.all([getTranslations("leaderboards"), getLeaderboards(locale), isDocumentLoad(), getWeekStanding(locale)]);
  const href = (b: Board, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...(b === "week" ? {} : { board: b }), ...extra });
    const s = p.toString();
    return s ? `/app/leaderboards?${s}` : "/app/leaderboards";
  };
  const items = [
    { value: "week", label: t("tabs.weekly"), href: href("week") },
    { value: "month", label: t("tabs.monthly"), href: href("month") },
    { value: "all", label: t("tabs.allTime"), href: href("all") },
    { value: "companies", label: t("tabs.company"), href: href("companies") },
  ];

  let until: string | null = null;
  let menu = null;
  let content;

  if (board === "companies") {
    const [cup, breakdown] = await Promise.all([getCompanyCup(locale), getCompanyPointsBreakdown(locale)]);
    // The table is the cup's race; with no quarter taken yet, the month's — and it says which.
    const raceRows = cup ? cup.rows : (boards.company?.rows ?? []);
    const metric = cup ? cup.metric : boards.companyMetric;
    const moment = await getBoardMoment(locale, "company", cup ? { ...boards, company: { rows: cup.rows, isFinal: cup.isFinal, takenAt: cup.takenAt, periodStart: cup.periodStart } } : boards);
    content = (
      <div className="flex flex-col gap-4">
        {/* ★ The table and the card name ONE race, in words (the lead's condition 1): the cup's quarter, or — only while
            no quarter has been taken — «سباق هذا الشهر», labelled so it is never mistaken for the cup. */}
        {cup ? (
          <CupCard cup={cup} locale={locale} />
        ) : (
          <h2 id="race-period" className="text-label font-bold text-fg-heading">
            {t("cup.monthFallback")}
          </h2>
        )}
        <section id="company" aria-labelledby={cup ? "cup-heading" : "race-period"}>
          <CompanyBoard rows={raceRows} metric={metric} moment={moment} acknowledge={acknowledgeBoardSeen.bind(null, locale, moment.mark)} documentLoad={documentLoad} />
        </section>
        <CompanyPointsBreakdownSection breakdown={breakdown} locale={locale} timeZone={boards.timeZone} />
      </div>
    );
  } else {
    let rows: MemberBoardRow[];
    let moment: BoardMoment;
    let windowLabel: string;
    let finality = null;
    let takenAt: string | null = null;
    let sectionId: string;
    if (board === "week") {
      const weekly = await getWeeklyBoard(locale);
      rows = weekly.rows;
      moment = standing.moment;
      windowLabel = t("rankCard.windowPoints.week");
      sectionId = "weekly";
      until = t.markup("week.until", {
        day: new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { weekday: "long", timeZone: "UTC" }).format(new Date(`${weekly.window.end}T12:00:00Z`)),
        bdi: (c) => c,
      });
    } else if (board === "month") {
      rows = boards.monthly?.rows ?? [];
      moment = await getBoardMoment(locale, "monthly", boards);
      windowLabel = t("rankCard.windowPoints.month");
      sectionId = "monthly";
      if (boards.monthly) {
        finality = (
          <Badge tone={boards.monthly.isFinal ? "success" : "info"} size="sm">
            {boards.monthly.isFinal ? t("monthly.final") : t("monthly.provisional")}
          </Badge>
        );
      }
    } else {
      const categories = await listBoardCategories(locale);
      const topic = query.category ? await getTopicBoard(locale, query.category) : null;
      rows = topic ? topic.rows : boards.allTime;
      moment = topic ? { occurrenceId: null, seenRank: null, seenFraction: null, needsMark: false, mark: { board: "all_time", period: null, rank: null, companyId: null, fraction: null } } : await getBoardMoment(locale, "all_time", boards);
      windowLabel = topic ? topic.categoryName : t("rankCard.windowPoints.all");
      // A category's board is a nightly snapshot, not live like the windows: it says when it was taken (the lead's
      // condition on D30). One with no snapshot yet is the board's empty state, never an error.
      if (topic?.takenAt) takenAt = formatDateTime(topic.takenAt, boards.timeZone, locale);
      sectionId = "all-time";
      if (categories.length > 0) {
        menu = (
          <Menu
            align="end"
            trigger={
              <Button variant="secondary" size="sm" iconEnd={<ChevronIcon direction="down" />}>
                {topic ? t.rich("category.current", { name: topic.categoryName, bdi: (c) => <bdi>{c}</bdi> }) : t("category.trigger")}
              </Button>
            }
            items={[
              { label: t("category.all"), href: href("all"), current: !topic },
              ...categories.map((c) => ({ label: c.name, href: href("all", { category: c.id }), current: topic?.categoryId === c.id })),
            ]}
          />
        );
      }
    }
    const place = board === "week" ? (standing.rank ? { rank: standing.rank.rank, points: standing.rank.points, above: standing.rank.above ? { displayName: standing.rank.above.displayName, gap: standing.rank.above.gap } : null } : null) : boardPlace(rows);
    const extra: Record<string, string> = { rows: String(BOARD_MORE) };
    if (board === "all" && query.category) extra.category = query.category;
    const moreHref = limit < BOARD_MORE && rows.length > limit ? href(board, extra) : null;
    content = (
      <section id={sectionId} aria-label={items.find((i) => i.value === board)!.label} className="flex flex-col gap-3">
        {finality}
        {takenAt ? <p className="text-caption text-fg-muted">{t.rich("category.takenAt", { date: takenAt, bdi: (c) => <bdi>{c}</bdi> })}</p> : null}
        <MemberBoard
          rows={rows}
          place={place}
          windowLabel={windowLabel}
          optedOut={standing.optedOut}
          limit={limit}
          moreHref={moreHref}
          moment={moment}
          // Always bound, as before the rebuild: `MomentRank` decides from `needsMark` whether to send it, and its root
          // (`data-moment`) is on the board whether or not a moment plays — the suites wait on it.
          acknowledge={acknowledgeBoardSeen.bind(null, locale, moment.mark)}
          documentLoad={documentLoad}
        />
      </section>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BoardTopRow title={t("title")} until={until} menu={menu} />
      <Tabs label={t("title")} value={board} items={items}>
        {content}
      </Tabs>
    </div>
  );
}
