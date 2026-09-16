import { getTranslations } from "next-intl/server";
import { FilterSheet } from "@/components/browse/filter-sheet";
import {
  chipEntries,
  getFilter,
  isFiltered,
  timelineHref,
  withFilter,
  withoutFilter,
  type FilterKey,
  type TimelineQuery,
} from "@/components/browse/timeline-query";
import { formatDate } from "@/components/sessions/numerals";
import { Link } from "@/components/ui/link";
import { TagChip } from "@/components/ui/tag-chip";
import type { TimelineData } from "@/lib/dal/search";

// The timeline's filters — REQ-UIX-022, REQ-DSC-005, `16` §6.2, DEC-112.
//
// ★ FILTERS BELONG TO THE TIMELINE, and their state is visible without opening
// anything. Two rows, both above the one column:
//
//   · ROW A — always there: «القادمة · جارية الآن · انتهت», the categories, and
//     «المزيد من عوامل التصفية». These are LINKS to the next state of the URL,
//     so they work before JavaScript, and a pressed one carries its own × that
//     removes it and nothing else. ★ It WRAPS, and on a phone the filter button
//     takes a line of its own: the first build scrolled the chips beside the
//     button, and at 390 px the button's width clipped «جارية الآن» to «جارية»
//     — a different word.
//   · ROW B — whenever anything else is applied: one chip per filter, NAMED
//     («الوسم: تقارير», not a uuid), each removable on its own, and one
//     «امسح الكل». It wraps and never scrolls, so an applied filter cannot sit
//     out of view while the list looks mysteriously short.
//
// Every href is `/app/sessions?…` — a filter applied on `/app` lands on the
// canonical URL (DEC-130).

export async function FilterBar({ query, data, locale }: { query: TimelineQuery; data: TimelineData; locale: string }) {
  const t = await getTranslations("browse");
  const status = getFilter(query, "status");
  const category = getFilter(query, "category");

  const statusToggle = (value: "upcoming" | "live" | "ended") => {
    const selected = value === "upcoming" ? !status || status === "open" : status === value;
    const next = value === "upcoming" ? withoutFilter(query, "status") : withFilter(query, "status", value);
    return (
      <li key={value} className="shrink-0">
        <TagChip
          label={t(`filters.status.${value}`)}
          href={timelineHref(selected && value !== "upcoming" ? withoutFilter(query, "status") : next)}
          selected={selected}
          removeHref={selected && value !== "upcoming" ? timelineHref(withoutFilter(query, "status")) : undefined}
          removeLabel={t("filters.remove", { label: t(`filters.status.${value}`) })}
        />
      </li>
    );
  };

  const chipLabel = (key: FilterKey, value: string): string => {
    switch (key) {
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
      case "from":
      case "to":
        return t(`filters.chip.${key}`, { value: formatDate(`${value}T12:00:00Z`, "UTC", locale) });
      case "presenter":
        return t("filters.chip.presenter", { value });
      default:
        return t("filters.chip.q", { value });
    }
  };

  const chips = chipEntries(query);

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label={t("filters.label")} className="flex flex-col items-start gap-2 md:flex-row md:items-center">
        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {statusToggle("upcoming")}
          {statusToggle("live")}
          {statusToggle("ended")}
          {data.options.categories.length > 0 ? <li aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-edge" /> : null}
          {data.options.categories.map((c) => {
            const selected = category === c.id;
            return (
              <li key={c.id} className="shrink-0">
                <TagChip
                  label={c.name}
                  href={timelineHref(selected ? withoutFilter(query, "category") : withFilter(query, "category", c.id))}
                  selected={selected}
                  removeHref={selected ? timelineHref(withoutFilter(query, "category")) : undefined}
                  removeLabel={t("filters.remove", { label: c.name })}
                />
              </li>
            );
          })}
        </ul>
        <div className="shrink-0 md:ms-auto">
          <FilterSheet
            search={new URLSearchParams(query.entries.map(([k, v]) => [k, v])).toString()}
            options={{ venues: data.options.venues, companies: data.options.companies, tags: data.options.tags, presenters: data.options.presenters }}
          />
        </div>
      </nav>

      {isFiltered(query) && !(query.entries.length === 1 && status === "open") ? (
        <div className="flex flex-wrap items-center gap-2">
          <ul aria-label={t("filters.active")} className="flex flex-wrap items-center gap-2 empty:hidden">
            {chips.map(([key, value]) => {
              const label = chipLabel(key, value);
              return (
                <li key={key}>
                  <TagChip label={label} removeHref={timelineHref(withoutFilter(query, key))} removeLabel={t("filters.remove", { label })} />
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
