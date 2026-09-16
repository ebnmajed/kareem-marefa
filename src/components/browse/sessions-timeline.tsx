import { getTranslations } from "next-intl/server";
import { FilterBar } from "@/components/browse/filter-bar";
import { SessionCard } from "@/components/browse/session-card";
import { firstDayOfWeek, groupEnded, groupUpcoming, monthLabel } from "@/components/browse/timeline-groups";
import { getFilter, isFiltered, parseTimelineQuery, timelineHref, withoutFilter, type TimelineQuery } from "@/components/browse/timeline-query";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { getMe } from "@/lib/dal/members";
import { getTimeline, type TimelineData, type TimelineSession } from "@/lib/dal/search";

// The sessions timeline — `/app` AND `/app/sessions`, one component on two
// routes, not a redirect (DEC-112, DEC-130, REQ-UIX-021, REQ-UIX-022).
//
// What a member can ATTEND, in one column, grouped by date, social media in
// rhythm and scanning: generous cards, state legible while scrolling, nothing
// beside the list competing for its width. The member's next committed session
// is the FIRST ITEM of the timeline, not a hero above it, and it is not
// repeated in its date group. The empty case is this same screen with an
// invitation to propose — never a different page.
//
// `/app` is where sign-in lands, so it renders this directly rather than
// costing every member a redirect. It ignores its own query string: the
// canonical, linkable, filterable address is `/app/sessions`, and every filter
// control on either route links there.

export async function SessionsTimeline({ locale, searchParams }: { locale: string; searchParams?: Record<string, string | string[] | undefined> }) {
  const query = parseTimelineQuery(searchParams ?? {});
  const [data, me, t, tApp] = await Promise.all([getTimeline(locale, query), getMe(locale), getTranslations("browse"), getTranslations("app.home")]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />

      {/* REQ-PRF-001: a member with no company is asked for one before they can
          reserve — said here, where they are about to try. */}
      {!me.companyId ? (
        <div role="status">
          <Panel tone="info" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body text-fg-heading">{tApp("companyMissing")}</p>
            <Link href="/app/me" className={buttonClass("primary", "md")}>
              {tApp("completeProfile")}
            </Link>
          </Panel>
        </div>
      ) : null}

      <FilterBar query={query} data={data} locale={locale} />

      {data.total === 0 ? <TimelineEmpty query={query} data={data} locale={locale} /> : <TimelineList data={data} locale={locale} />}
    </div>
  );
}

async function TimelineList({ data, locale }: { data: TimelineData; locale: string }) {
  const t = await getTranslations("browse");
  const now = new Date();
  const groups = data.status === "ended" ? groupEnded(data.items, data.orgTimeZone) : groupUpcoming(data.items, now, data.orgTimeZone, firstDayOfWeek(locale === "ar" ? "ar-SA" : locale));

  return (
    <div className="flex flex-col gap-8">
      {data.pinned ? (
        <section aria-labelledby="timeline-pinned" className="flex flex-col gap-3">
          <h2 id="timeline-pinned" className="sr-only">
            {t("timeline.pinned")}
          </h2>
          <SessionCard session={data.pinned} locale={locale} pinned />
          {data.pinned.canCheckIn ? (
            // Outside the card: a link inside the card's own link would nest anchors.
            <Link href={`/app/sessions/${data.pinned.id}/check-in`} className={buttonClass("primary", "md", "w-full")}>
              {(await getTranslations("sessions.event"))("checkIn")}
            </Link>
          ) : null}
        </section>
      ) : null}

      {groups.map((group) => {
        const id = `timeline-${group.key.replace(/[^a-z0-9-]/gi, "-")}`;
        const title = group.key.startsWith("month:") ? (monthLabel(group.key, locale) ?? "") : t(`timeline.groups.${group.key as "live"}`);
        return (
          <section key={group.key} aria-labelledby={id} className="flex flex-col gap-3">
            <SectionHeader id={id} title={title} count={group.items.length} className="border-t border-edge pt-4" />
            <ol className="flex flex-col gap-3">
              {group.items.map((session: TimelineSession) => (
                <li key={session.id}>
                  <SessionCard session={session} locale={locale} />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Two empty states on the same screen (REQ-UIX-012):
 *   · FILTERED-EMPTY names the one filter whose removal restores the most, says
 *     how many it would restore, and offers to drop just that one — beside
 *     «امسح كل عوامل التصفية», never instead of it (REQ-UIX-022);
 *   · otherwise an invitation to propose, or, for «جارية الآن»/«انتهت», a way
 *     back to what is coming.
 */
async function TimelineEmpty({ query, data, locale }: { query: TimelineQuery; data: TimelineData; locale: string }) {
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
    // `EmptyState` takes strings, so the name is isolated with FSI … PDI — the
    // same isolation a `<bdi>` gives: a Latin tag must not reorder the Arabic
    // sentence around it (`10` §3).
    const isolated = `\u2068${named}\u2069`;
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

  return (
    <EmptyState title={t("emptyState.upcoming.title")} description={t("emptyState.upcoming.description")} action={{ label: t("emptyState.upcoming.action"), href: "/app/propose" }} />
  );
}
