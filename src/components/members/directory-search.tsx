import { getTranslations } from "next-intl/server";
import { SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import type { DirectoryState } from "@/components/members/directory-query";

// The directory's search — `Directory.dc.html:23-26`, REQ-PRF-005: by name or job title. A plain GET form to
// `/app/members` (browse's pattern, `browse/search-field.tsx`): it works with no JavaScript and the result is a URL.
// The other filters ride along as hidden fields, so a search narrows what is on screen rather than clearing it; a
// new search starts at the first page.
export async function DirectorySearch({ locale, state }: { locale: string; state: DirectoryState }) {
  const t = await getTranslations("members.directory");
  const hidden: [string, string][] = [];
  if (state.companyId) hidden.push(["company", state.companyId]);
  if (state.interestId) hidden.push(["interest", state.interestId]);
  if (state.order === "name") hidden.push(["order", "name"]);
  if (state.includeDeactivated) hidden.push(["inactive", "1"]);
  return (
    <form action={`/${locale}/app/members`} method="get" role="search">
      <label htmlFor="members-search" className="sr-only">
        {t("searchLabel")}
      </label>
      {hidden.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Input
        id="members-search"
        type="search"
        name="q"
        size="lg"
        defaultValue={state.q}
        placeholder={t("searchPlaceholder")}
        startIcon={<SearchIcon className="text-fg-muted" />}
        className="w-full"
      />
    </form>
  );
}
