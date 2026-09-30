import { getTranslations } from "next-intl/server";
import { FilterSheet } from "@/components/browse/filter-sheet";
import {
  appliedEntries,
  getFilter,
  timelineHref,
  withFilter,
  withoutFilter,
  type FilterKey,
  type TimelineQuery,
} from "@/components/browse/timeline-query";
import { formatDate } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Menu } from "@/components/ui/menu";
import { TagChip } from "@/components/ui/tag-chip";
import type { TimelineData } from "@/lib/dal/search";

// Browse's filters — `Browse.dc.html`, `M10a.md` §6, REQ-UIX-060, REQ-UIX-022,
// DEC-207 (N4).
//
// ONE chip row: «الحالة: …» and «التصنيف: …» are `ui/menu`s whose items are
// LINKS to the next state of the URL, and «المزيد» opens the facet sheet. Each
// chip's label says what is applied, so a member can tell what they are filtered
// to without opening anything. The row wraps and never clips: wave 6 met a
// scrolling row that cut «جارية الآن» to «جارية».
//
// ★ THEN, WHENEVER ANYTHING IS APPLIED, one removable chip per filter — named,
// never an id — and «امسح الكل». The status and the category are listed there
// too, since their toggles are gone: each is removable on its own, as a link.
//
// Every href is `/app/sessions?…` — the canonical URL (DEC-130).

export async function FilterChips({ query, data, locale }: { query: TimelineQuery; data: TimelineData; locale: string }) {
  const t = await getTranslations("browse");
  const status = getFilter(query, "status");
  const category = getFilter(query, "category");
  const statusValue = status === "live" || status === "ended" ? status : "upcoming";
  const categoryName = data.options.categories.find((c) => c.id === category)?.name;

  const trigger = (label: string) => (
    <Button type="button" variant="secondary" size="sm" iconEnd={<ChevronIcon direction="down" />}>
      {label}
    </Button>
  );

  const chipLabel = (key: FilterKey, value: string): string => {
    switch (key) {
      case "status":
        return t("filters.statusChip", { value: t(`filters.status.${value === "open" ? "upcoming" : (value as "live")}`) });
      case "category":
        return t("filters.categoryChip", { value: data.options.categories.find((c) => c.id === value)?.name ?? "" });
      case "tag":
        return t("filters.chip.tag", { value: data.options.tags.find((tag) => tag.normalised === value)?.label ?? value });
      case "venue":
        return t("filters.chip.venue", { value: data.options.venues.find((v) => v.id === value)?.name ?? "" });
      case "company":
        return t("filters.chip.company", { value: data.options.companies.find((c) => c.id === value)?.name ?? "" });
      case "level":
        return t("filters.chip.level", { value: t(`card.level.${value as "introductory"}`) });
      case "language":
        return t("filters.chip.language", { value: t(`card.language.${value as "ar"}`) });
      case "when":
        return t("filters.chip.when", { value: t(`timeline.groups.${value as "thisWeek"}`) });
      case "from":
      case "to":
        return t(`filters.chip.${key}`, { value: formatDate(`${value}T12:00:00Z`, "UTC", locale) });
      case "presenter":
        return t("filters.chip.presenter", { value });
      default:
        return t("filters.chip.q", { value });
    }
  };

  // The removal's name is the filter's own word — «أزل عامل التصفية: ذكاء اصطناعي» — as it was on the toggles.
  const removeName = (key: FilterKey, value: string, label: string): string =>
    key === "category" ? (categoryName ?? label) : key === "status" ? t(`filters.status.${value === "open" ? "upcoming" : (value as "live")}`) : label;

  const applied = appliedEntries(query);

  return (
    <div className="flex flex-col gap-2.5">
      <nav aria-label={t("filters.label")}>
        <ul className="flex flex-wrap items-center gap-2">
          <li>
            <Menu
              trigger={trigger(t("filters.statusChip", { value: t(`filters.status.${statusValue}`) }))}
              items={(["upcoming", "live", "ended"] as const).map((value) => ({
                label: t(`filters.status.${value}`),
                href: timelineHref(value === "upcoming" ? withoutFilter(query, "status") : withFilter(query, "status", value)),
                current: value === statusValue,
              }))}
            />
          </li>
          {data.options.categories.length > 0 ? (
            <li>
              <Menu
                trigger={trigger(t("filters.categoryChip", { value: categoryName ?? t("filters.allCategories") }))}
                items={[
                  { label: t("filters.allCategories"), href: timelineHref(withoutFilter(query, "category")), current: !categoryName },
                  ...data.options.categories.map((c) => ({
                    label: c.name,
                    href: timelineHref(withFilter(query, "category", c.id)),
                    current: c.id === category,
                  })),
                ]}
              />
            </li>
          ) : null}
          <li>
            <FilterSheet
              search={new URLSearchParams(query.entries.map(([k, v]) => [k, v])).toString()}
              options={{ venues: data.options.venues, companies: data.options.companies, tags: data.options.tags, presenters: data.options.presenters }}
            />
          </li>
        </ul>
      </nav>

      {applied.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <ul aria-label={t("filters.active")} className="flex flex-wrap items-center gap-2">
            {applied.map(([key, value]) => {
              const label = chipLabel(key, value);
              return (
                <li key={key}>
                  <TagChip label={label} removeHref={timelineHref(withoutFilter(query, key))} removeLabel={t("filters.remove", { label: removeName(key, value, label) })} />
                </li>
              );
            })}
          </ul>
          <Link href="/app/sessions" quiet className="text-label text-fg-heading underline underline-offset-4">
            {t("filters.clearAll")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
