import { getTranslations } from "next-intl/server";
import { getFilter, timelineHref, withFilter, withoutFilter, type TimelineQuery } from "@/components/browse/timeline-query";
import { TagChip } from "@/components/ui/tag-chip";
import type { TimelineData } from "@/lib/dal/search";

// The eight most-used tags — `Browse.dc.html`, `M10a.md` §6, REQ-UIX-060. Each is a
// LINK to the filtered URL; the applied one is pressed, and pressing it again
// drops it. The vocabulary is the timeline's own (`data.options.tags`), already
// ordered by how many visible sessions carry each. With no tags nothing is drawn.
const TOP = 8;

export async function TagCloud({ query, data }: { query: TimelineQuery; data: TimelineData }) {
  const tags = data.options.tags.slice(0, TOP);
  if (tags.length === 0) return null;
  const t = await getTranslations("browse.filters");
  const applied = getFilter(query, "tag");
  return (
    <ul aria-label={t("tags")} className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const selected = applied === tag.normalised;
        return (
          <li key={tag.normalised}>
            <TagChip label={`#${tag.label}`} href={timelineHref(selected ? withoutFilter(query, "tag") : withFilter(query, "tag", tag.normalised))} selected={selected} />
          </li>
        );
      })}
    </ul>
  );
}
