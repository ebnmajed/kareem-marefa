import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FilterSheet } from "@/components/browse/filter-sheet";
import { SessionCard } from "@/components/browse/session-card";
import { SearchFilters } from "@/components/search/filters";
import { formatNumber } from "@/components/sessions/numerals";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { searchSessions, type SearchFilters as SearchFiltersInput } from "@/lib/dal/search";
import { isSessionBookmarked } from "@/lib/dal/bookmarks";

// SCR-011 · /app/sessions — browse and search (REQ-DSC-003, REQ-DSC-005,
// REQ-DSC-007, REQ-SES-011). `console`'s first story this wave (DEC-048).
//
// This page reads the URL's own filter params and calls `searchSessions()`
// (`src/lib/dal/search.ts`, content-owned, unchanged) with them — the param
// names below are `content`'s own contract (`filters-form.tsx`'s header),
// not invented here. Filtering and tenancy/tier visibility are entirely
// `searchSessions()`'s and the RLS-bound client's; this page adds none of
// its own. `<SearchFilters>` renders its own removable-chip row for
// `REQ-DSC-005`'s "the active set is visible and clearable," so the page
// does not build a second one.
export default async function BrowseSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    venue?: string;
    company?: string;
    level?: string;
    language?: string;
    presenter?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const filters: SearchFiltersInput = {
    q: sp.q || undefined,
    categoryId: sp.category || undefined,
    venueId: sp.venue || undefined,
    companyId: sp.company || undefined,
    level: sp.level === "introductory" || sp.level === "intermediate" || sp.level === "advanced" ? sp.level : undefined,
    language: sp.language === "ar" || sp.language === "en" ? sp.language : undefined,
    presenter: sp.presenter || undefined,
    dateFrom: sp.from || undefined,
    dateTo: sp.to || undefined,
  };
  const hasActiveFilters = Object.values(sp).some((v) => !!v);

  const [results, prefs, t] = await Promise.all([searchSessions(locale, filters), getOrgPrefs(locale), getTranslations("browse")]);
  const bookmarked = await Promise.all(results.map((r) => isSessionBookmarked(locale, r.id)));

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>

      <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-start">
        <FilterSheet>
          <SearchFilters locale={locale} />
        </FilterSheet>

        <div className="min-w-0 flex-1">
          {results.length === 0 ? (
            <div className="rounded-field border border-edge p-6 text-center">
              <p className="text-body text-fg-body">{t("empty")}</p>
              {hasActiveFilters ? (
                <Link href="/app/sessions" className="mt-3 inline-block text-body-sm text-fg-heading underline underline-offset-4">
                  {t("clearFilters")}
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <p className="text-body-sm text-fg-muted">{t("count", { count: results.length, value: formatNumber(results.length, prefs.numerals) })}</p>
              <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((r, i) => (
                  <SessionCard key={r.id} session={r} locale={locale} numerals={prefs.numerals} timeZone={prefs.timeZone} bookmarked={bookmarked[i]} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
