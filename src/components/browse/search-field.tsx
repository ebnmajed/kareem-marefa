import { getTranslations } from "next-intl/server";
import { getFilter, type TimelineQuery } from "@/components/browse/timeline-query";
import { SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";

// Browse's search field, IN THE PAGE — `Browse.dc.html`, `M10a.md` §6, REQ-UIX-060,
// REQ-DSC-003.
//
// A plain GET form to `/app/sessions`: it works with no JavaScript, and the result
// is a URL — the query string is the state (`timeline-query.ts`). Every other
// applied filter rides along as a hidden field, so a search narrows what is on
// screen instead of clearing it (REQ-UIX-022: removing one never clears the others).
//
// ★ `id="browse-search"` is the shell's contract (DEC-207 §2): below `lg` the top
// bar's search control is a link to `/app/sessions#browse-search`, and lands here.
export async function SearchField({ locale, query }: { locale: string; query: TimelineQuery }) {
  const t = await getTranslations("browse.search");
  return (
    <form action={`/${locale}/app/sessions`} method="get" role="search">
      <label htmlFor="browse-search" className="sr-only">
        {t("label")}
      </label>
      {query.entries
        .filter(([key]) => key !== "q")
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      <Input
        id="browse-search"
        type="search"
        name="q"
        size="lg"
        defaultValue={getFilter(query, "q") ?? ""}
        placeholder={t("placeholder")}
        startIcon={<SearchIcon className="text-fg-muted" />}
        className="w-full"
      />
    </form>
  );
}
