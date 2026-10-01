import { getTranslations, setRequestLocale } from "next-intl/server";
import { AutoMore } from "@/components/members/auto-more";
import { DirectoryFilters } from "@/components/members/directory-filters";
import { directoryHref, parseDirectoryQuery } from "@/components/members/directory-query";
import { DirectoryRow } from "@/components/members/directory-row";
import { DirectorySearch } from "@/components/members/directory-search";
import { DirectorySort } from "@/components/members/directory-sort";
import { formatNumber } from "@/components/sessions/numerals";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listDirectory } from "@/lib/dal/members";

// SCR-019 · /app/members — the directory, NEW in wave 19, built from `Directory.dc.html` (`M10b.md` §5,
// REQ-UIX-068, REQ-PRF-005, STORY-UIX-057, DEC-213 §5.106 – §5.113, DEC-214).
//
// Regions, in the artboard's order: the title with the count and the order — the page's own phone top row, no
// wordmark (contract 1) · the search · the company chips (and the interests, only when the org has any) · the rows ·
// «N من M» with the «more» link. The tab bar and, from `lg`, the bar and the rail are the frame's.
//
// ★ TIERING IS THE DAL'S (A33, contract 7): `listDirectory()` returns tier-1 fields only, already filtered, ordered
// and paged. This page decides nothing about who may see what. ★ THE URL IS THE STATE (`directory-query.ts`): a
// cold `?page=3` renders the first three pages of matches, so the list works without JavaScript (§5.110).
export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const state = parseDirectoryQuery(await searchParams);
  const [data, t] = await Promise.all([listDirectory(locale, state), getTranslations("members.directory")]);
  const filtered = Boolean(state.q || state.companyId || state.interestId);

  return (
    <div className="flex flex-col gap-3">
      {/* ★ ONE ROW, as drawn: the title and its count at the start, the order at the end. `page-header` stacks its
          actions under the title below `md`, so the order is its sibling here, as browse's bell is. */}
      <div className="flex items-center justify-between gap-3">
        <PageHeader title={t("title")} count={formatNumber(data.total)} className="min-w-0" />
        <div className="shrink-0">
          <DirectorySort state={state} />
        </div>
      </div>
      <DirectorySearch locale={locale} state={state} />
      <DirectoryFilters state={state} data={data} />

      {data.matched === 0 ? (
        state.q ? (
          <EmptyState
            title={t("emptySearch")}
            action={{ label: t("clearSearch"), href: directoryHref(state, { q: "", page: 1 }) }}
            size="sm"
          />
        ) : (
          <EmptyState
            title={t("emptyFilter")}
            action={{ label: t("backToAll"), href: "/app/members" }}
            clearFilter={filtered ? { label: t("clearFilter"), href: directoryHref(state, { companyId: undefined, interestId: undefined, page: 1 }) } : undefined}
            size="sm"
          />
        )
      ) : (
        <section aria-label={t("list")} className="flex flex-col gap-2">
          <ul className="grid gap-2 lg:grid-cols-2">
            {data.members.map((member) => (
              <li key={member.id} className="min-w-0">
                <DirectoryRow member={member} />
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center justify-center gap-x-2 py-2 text-center text-caption text-fg-muted">
            <span>{t("shown", { shown: formatNumber(data.members.length), total: formatNumber(data.matched) })}</span>
            {data.members.length < data.matched ? (
              <>
                <span aria-hidden="true">·</span>
                <AutoMore href={directoryHref(state, { page: data.page + 1 })} label={t("more")} />
                <span aria-hidden="true">·</span>
                <span>{t("moreHint")}</span>
              </>
            ) : null}
          </p>
        </section>
      )}
    </div>
  );
}
