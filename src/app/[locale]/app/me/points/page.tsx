import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { PointsHistoryList } from "@/components/scoring/points-history-list";
import { PointsCatalogue } from "@/components/scoring/points-catalogue";
import { getPointsHistory } from "@/lib/dal/points";

// SCR-022 · /app/me/points — the member's full points history (REQ-PTS-003,
// `05` §8). The whole point of this screen: a member can explain every
// point they hold without asking anyone. Filterable by session and by
// month (`05` §8); both filters are plain GET params, so the filtered view
// is a real, shareable URL rather than client-only state.
export default async function PointsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session?: string; month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { session: sessionId, month } = await searchParams;

  const [t, history] = await Promise.all([getTranslations("scoring.points"), getPointsHistory(locale, { sessionId, month })]);
  const value = formatNumber(history.totalPoints);
  const filtered = Boolean(sessionId || month);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("ar", { month: "long", year: "numeric", timeZone: history.timeZone }).format(d);
    return { key, label };
  });

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-2 text-body text-fg-muted">{t("intro")}</p>
      <p className="mt-4 text-h3 text-fg-heading">{t("balance", { count: history.totalPoints, value })}</p>

      <form method="get" aria-labelledby="filters-heading" className="mt-6 flex flex-wrap items-end gap-4">
        <h2 id="filters-heading" className="sr-only">
          {t("filters.heading")}
        </h2>
        <label className="flex flex-col gap-1">
          <span className="text-label text-fg-muted">{t("filters.session")}</span>
          <select name="session" defaultValue={sessionId ?? ""} className="h-10 rounded-field border border-edge bg-canvas px-3 text-body text-fg-heading">
            <option value="">{t("filters.allSessions")}</option>
            {history.sessionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-fg-muted">{t("filters.month")}</span>
          <select name="month" defaultValue={month ?? ""} className="h-10 rounded-field border border-edge bg-canvas px-3 text-body text-fg-heading">
            <option value="">{t("filters.allMonths")}</option>
            {monthOptions.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded-field bg-navy-950 px-5 text-label text-white hover:bg-navy-900">
          {t("filters.heading")}
        </button>
        {filtered ? (
          <a href="?" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
            {t("filters.clear")}
          </a>
        ) : null}
      </form>

      {/* A plain, unlabelled wrapper — not a landmark, just something to
          scope a test locator to (the catalogue below repeats a rule's own
          reasonAr, which can equal a specific award's reason here). */}
      <div id="history">
        <PointsHistoryList rows={history.rows} timeZone={history.timeZone} />
      </div>

      <PointsCatalogue entries={history.catalogue} />
    </>
  );
}
