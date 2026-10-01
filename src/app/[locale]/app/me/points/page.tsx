import { getTranslations, setRequestLocale } from "next-intl/server";
import { HubStrip } from "@/components/shell/hub-strip";
import { HubTopRow } from "@/components/shell/hub-top-row";
import { isDocumentLoad } from "@/components/scoring/document-load";
import { PointsCatalogueList } from "@/components/scoring/points-catalogue-list";
import { PointsFilters } from "@/components/scoring/points-filters";
import { PointsHeadCard } from "@/components/scoring/points-head-card";
import { PointsLedger } from "@/components/scoring/points-ledger";
import { formatNumber } from "@/components/sessions/numerals";
import { getPointsHead, getPointsLedger, LEDGER_PAGE } from "@/lib/dal/points";
import { acknowledgePointsSeen } from "./actions";

// SCR-022 · «نقاطي» — `/app/me/points`. Written from `docs/design/screens/m10c/Points.dc.html` (phone) and
// `HubDesktop.dc.html` (desktop) in wave 20, after the old page and its three components were deleted (DEC-208); the
// kept-behaviour table is §2.1 of `docs/plan/notes/scoring.md`'s wave-20 plan. `REQ-UIX-072`, `REQ-PTS-003`: a member
// explains every point without asking anyone.
//
// In the artboard's order: the page's own top row (`HubTopRow`, the `h1` at every width) and the phone strip — from
// `lg` the hub's layout draws the band and the strip above this — then the head card (balance, level, bar; `lg:hidden`,
// the band carries them there), the filters, the ledger grouped by month (a table from `lg`), «المزيد», and «ماذا
// يمنحك نقاطًا؟».
//
// ★ The data is read at the data (`sessionClient` → `requireSession()`), never in a layout. The filters are plain GET
// params — a shareable URL; `rows` pages by 50. Moments 3 and 4 are the head's; the mark it acknowledges is bound
// here, so the client sends nothing of its own.
export default async function PointsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session?: string; month?: string; rows?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const [t, ledger, head, documentLoad] = await Promise.all([
    getTranslations("scoring.points"),
    getPointsLedger(locale, { sessionId: query.session, month: query.month, rows: Number(query.rows) || undefined }),
    getPointsHead(locale),
    isDocumentLoad(),
  ]);

  const filtered = Boolean(ledger.filters.sessionId || ledger.filters.month);
  const monthLabel = (key: string) =>
    new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));

  const more = new URLSearchParams();
  if (ledger.filters.sessionId) more.set("session", ledger.filters.sessionId);
  if (ledger.filters.month) more.set("month", ledger.filters.month);
  more.set("rows", String(ledger.rows + LEDGER_PAGE));
  const moreHref = ledger.shown < ledger.rowCount ? `/app/me/points?${more.toString()}` : null;

  return (
    <div className="flex flex-col gap-4">
      <HubTopRow title={t("title")} />
      <HubStrip />

      <div className="lg:hidden">
        <PointsHeadCard head={head} acknowledge={acknowledgePointsSeen.bind(null, locale, head.mark)} documentLoad={documentLoad} />
      </div>

      <PointsFilters
        sessions={ledger.sessionOptions.map((s) => ({ value: s.id, label: s.title }))}
        months={ledger.monthOptions.map((m) => ({ value: m, label: monthLabel(m) }))}
        session={ledger.filters.sessionId}
        month={ledger.filters.month}
        labels={{
          heading: t("filters.heading"),
          session: t("filters.session"),
          month: t("filters.month"),
          allSessions: t("filters.allSessions"),
          allMonths: t("filters.allMonths"),
          submit: t("ledger.submit"),
        }}
        count={t("ledger.count", { count: ledger.rowCount, value: formatNumber(ledger.rowCount) })}
        clear={filtered ? { label: t("filters.clear"), href: "/app/me/points" } : null}
      />

      <PointsLedger items={ledger.items} rowCount={ledger.rowCount} shown={ledger.shown} moreHref={moreHref} filtered={filtered} timeZone={ledger.timeZone} locale={locale} />

      <PointsCatalogueList entries={ledger.catalogue} />
    </div>
  );
}
