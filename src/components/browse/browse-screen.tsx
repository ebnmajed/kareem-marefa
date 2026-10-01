import { getTranslations } from "next-intl/server";
import { FilterChips } from "@/components/browse/filter-chips";
import { SearchField } from "@/components/browse/search-field";
import { SessionRow } from "@/components/browse/session-row";
import { TagCloud } from "@/components/browse/tag-cloud";
import { firstDayOfWeek, groupBrowse, groupEnded, monthLabel, type TimelineGroup } from "@/components/browse/timeline-groups";
import { getFilter, isFiltered, parseTimelineQuery, timelineHref, withFilter, withoutFilter, type TimelineQuery } from "@/components/browse/timeline-query";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { NotificationBell } from "@/components/notifications/bell";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { getTimeline, type TimelineData, type TimelineSession } from "@/lib/dal/search";

// SCR-011 · browse — rebuilt in wave 18 from `Browse.dc.html` (`M10a.md` §6,
// REQ-UIX-060, STORY-UIX-045; DEC-206 §4.63 – §4.65, DEC-207). The canonical,
// linkable, filterable address of the sessions (DEC-112, DEC-130): the query
// string is the state, so a filtered URL opened cold renders the same list.
//
// Regions, in the artboard's order: the title (with the bell, on the phone — the
// page owns its top row there, DEC-207 Q2) · the search field · one chip row with
// «المزيد» · the eight most-used tags · the sessions as rows in date groups — this
// week, next week, this month, later — and the ended ones behind one link.
//
// ★ NO SORT (§4.63) and no filter rail (§4.65); the order is `getTimeline()`'s.
// ★ NO PINNED ITEM (§4.64): the committed session stands in its own group, saying
// «مقعدك محجوز»; the home and the rail carry «التالية لك» now.
// ★ Search results replace the groups with one group, «نتائج».
//
// The company banner and the avatar prompt left with the old timeline for the home
// (DEC-207 §6.1): browse is where a member looks, the home is where they land.

export async function BrowseScreen({ locale, searchParams }: { locale: string; searchParams?: Record<string, string | string[] | undefined> }) {
  const query = parseTimelineQuery(searchParams ?? {});
  const [data, t] = await Promise.all([getTimeline(locale, query, new Date(), { pin: false }), getTranslations("browse")]);

  return (
    <div className="flex flex-col gap-4">
      {/* ★ ONE ROW, as drawn: the title at the start and the bell at the end. `page-header` stacks its
          actions under the title below `md`, so the bell is its sibling here, not its `actions`. From `lg`
          the shell's own bar carries the bell, and this one is hidden (DEC-207 Q2). */}
      <div className="flex items-center justify-between gap-3">
        <PageHeader title={t("title")} className="min-w-0" />
        <div className="shrink-0 lg:hidden">
          <NotificationBell locale={locale} />
        </div>
      </div>
      <SearchField locale={locale} query={query} />
      <FilterChips query={query} data={data} locale={locale} />
      <TagCloud query={query} data={data} />
      {data.total === 0 ? <BrowseEmpty query={query} data={data} locale={locale} /> : <BrowseList query={query} data={data} locale={locale} />}
    </div>
  );
}

async function BrowseList({ query, data, locale }: { query: TimelineQuery; data: TimelineData; locale: string }) {
  const t = await getTranslations("browse");
  const now = new Date();
  const searching = getFilter(query, "q") !== undefined;
  const status = getFilter(query, "status");

  const groups: TimelineGroup<TimelineSession>[] = searching
    ? [{ key: "results", items: data.items }]
    : status === "ended"
      ? groupEnded(data.items, data.orgTimeZone)
      : groupBrowse(data.items, now, data.orgTimeZone, firstDayOfWeek(locale === "ar" ? "ar-SA" : locale));

  // «سابقة» — the ended sessions behind ONE link with their count, in the default view only.
  const showPast = !searching && status !== "live" && status !== "ended" && data.endedCount > 0;

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const id = `browse-${group.key.replace(/[^a-z0-9-]/gi, "-")}`;
        const title = group.key.startsWith("month:") ? (monthLabel(group.key, locale) ?? "") : t(`timeline.groups.${group.key as "thisWeek"}`);
        return (
          <section key={group.key} aria-labelledby={id} className="flex flex-col gap-2">
            <SectionHeader
              id={id}
              title={title}
              actions={<span className="text-caption text-fg-muted">{t("count", { count: group.items.length, value: formatNumber(group.items.length) })}</span>}
            />
            <ol className="flex flex-col gap-2">
              {group.items.map((session) => (
                <li key={session.id}>
                  <SessionRow session={session} locale={locale} points={data.attendancePoints} now={now} />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      {showPast ? (
        <section aria-labelledby="browse-past">
          <SectionHeader
            id="browse-past"
            title={t("timeline.groups.past")}
            actions={
              <Link href={timelineHref(withFilter(query, "status", "ended"))} quiet className="text-caption text-fg-muted underline-offset-4 hover:underline">
                {t("timeline.showEnded", { count: data.endedCount, value: formatNumber(data.endedCount) })}
              </Link>
            }
          />
        </section>
      ) : null}
    </div>
  );
}

/**
 * The empty states, on the same screen (REQ-UIX-012):
 *   · FILTERED-EMPTY names the one filter whose removal restores the most, says how many it would
 *     restore, and offers to drop just that one — beside «امسح كل عوامل التصفية» (REQ-UIX-022);
 *   · otherwise an invitation to propose, or, for «جارية الآن»/«انتهت», the way back to what is coming.
 */
async function BrowseEmpty({ query, data, locale }: { query: TimelineQuery; data: TimelineData; locale: string }) {
  const t = await getTranslations("browse");
  const status = getFilter(query, "status");
  const onlyStatus = query.entries.length === 1 && status !== undefined;

  if (isFiltered(query) && !onlyStatus && data.dropOne) {
    const { key, count } = data.dropOne;
    const value = getFilter(query, key) ?? "";
    const named = (() => {
      switch (key) {
        case "category":
          return data.options.categories.find((c) => c.id === value)?.name ?? value;
        case "venue":
          return data.options.venues.find((v) => v.id === value)?.name ?? value;
        case "company":
          return data.options.companies.find((c) => c.id === value)?.name ?? value;
        case "tag":
          return data.options.tags.find((tag) => tag.normalised === value)?.label ?? value;
        case "status":
          return t(`filters.status.${value === "open" ? "upcoming" : (value as "live")}`);
        case "level":
          return t(`card.level.${value as "introductory"}`);
        case "language":
          return t(`card.language.${value as "ar"}`);
        case "when":
          return t(`timeline.groups.${value as "thisWeek"}`);
        case "from":
        case "to":
          return formatDate(`${value}T12:00:00Z`, "UTC", locale);
        default:
          return value;
      }
    })();
    // `EmptyState` takes strings, so the name is isolated with FSI … PDI — what a `<bdi>` gives:
    // a Latin tag must not reorder the Arabic sentence around it (`10` §3).
    const isolated = `⁨${named}⁩`;
    return (
      <EmptyState
        title={t("emptyState.filtered.title", { value: isolated })}
        description={count > 0 ? t("emptyState.filtered.restores", { count, value: formatNumber(count) }) : undefined}
        clearFilter={{ label: t("emptyState.filtered.drop", { value: isolated }), href: timelineHref(withoutFilter(query, key)) }}
        action={{ label: t("clearFilters"), href: "/app/sessions" }}
      />
    );
  }

  if (status === "live" || status === "ended") {
    return <EmptyState title={t(`emptyState.${status}.title`)} action={{ label: t(`emptyState.${status}.action`), href: "/app/sessions" }} />;
  }

  return <EmptyState title={t("emptyState.upcoming.title")} description={t("emptyState.upcoming.description")} action={{ label: t("emptyState.upcoming.action"), href: "/app/propose" }} />;
}
