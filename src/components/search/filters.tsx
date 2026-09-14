import { getSearchFilterOptions } from "@/lib/dal/search";
import { FiltersForm } from "@/components/search/filters-form";

// `<SearchFilters locale />` — SCR-011's filter rail (REQ-DSC-001, REQ-DSC-005).
// A server component only for its data (the org's own categories/venues/
// companies); all the interactive URL-state logic lives in the client
// sub-component below, matching the split every other slot in this track
// uses. This component reads no `sessionId`/`memberId` — it owns no data
// of its own beyond the filter option lists, and does no session/session-
// list fetching itself: the browse page (lead-owned) reads the URL's own
// query params and calls `searchSessions()` (src/lib/dal/search.ts) with
// them — this is a pure filter UI, not a results slot.
export async function SearchFilters({ locale }: { locale: string }) {
  const options = await getSearchFilterOptions(locale);
  return <FiltersForm options={options} />;
}
