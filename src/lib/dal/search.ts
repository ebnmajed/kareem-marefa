import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Org-wide search and filters — REQ-DSC-001 … REQ-DSC-007, 02 §4.15, SCR-011.
//
// ★ Design note (no `JOB-rebuild_search` here, and no denormalized search
// index): 07/11's sketch has `JOB-rebuild_search` fire "on category/company
// rename," which only makes sense if a session's searchable text caches a
// category/company NAME somewhere. It does not: `sessions.search_vector`
// (0037) is a `generated always … stored` column over `title`/`abstract`
// only, and this module matches tags/presenter/company by querying THOSE
// tables live, through the same RLS-bound client used everywhere else in
// this codebase — a rename is reflected on the very next search, with
// nothing to go stale and nothing to rebuild. This is simpler and strictly
// more correct than a cached index would be, so no `rebuild_search` job or
// extra schema was added for it; flagged to the lead as a deliberate
// deviation from 11 §2.6's job list, the same way DEC-047 documents
// deferring photo re-encoding.
//
// REQ-DSC-007 (material search is metadata-only) and REQ-MAT-006 (material
// availability) both fall out of the SAME choice: materials are matched by
// querying `public.materials` through the RLS-bound client, so `materials_
// read`'s own phase/removed_at gate (03 §5.5a) is what decides which
// materials' titles are even visible to match against — this module never
// reimplements that policy, and never touches document bytes at all.

export const searchFiltersInput = z.object({
  q: z.string().trim().max(200).optional(),
  categoryId: z.uuid().optional(),
  venueId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  level: z.enum(["introductory", "intermediate", "advanced"]).optional(),
  language: z.enum(["ar", "en"]).optional(),
  presenter: z.string().trim().max(200).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});
export type SearchFilters = z.infer<typeof searchFiltersInput>;

export interface SearchResultSession {
  id: string;
  title: string;
  abstract: string;
  level: string;
  language: string;
  startsAt: string | null;
  state: string;
}

export interface SearchFilterOptions {
  categories: { id: string; name: string }[];
  venues: { id: string; name: string }[];
  companies: { id: string; name: string }[];
}

/** REQ-DSC-004 — a JS port of `public.ar_normalize()` (0037), byte-for-byte the same
 *  transformation: strip tashkeel/tatweel, fold alef/yaa/taa-marbuta forms, collapse whitespace.
 *  Needed here because the free-text query has to be normalised the SAME way `search_vector`
 *  and `tags.normalised` already were at write time — matching "معرفات" against a stored
 *  "مُعرِّفات" only works if both sides go through the identical fold. */
export function arNormalize(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, "") // tashkeel (U+064B–U+0652) + dagger alef + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getSearchFilterOptions(locale: string): Promise<SearchFilterOptions> {
  const { session, supabase } = await sessionClient(locale);
  const [{ data: categories }, { data: venues }, { data: companies }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("org_id", session.orgId).is("deactivated_at", null).order("name"),
    supabase.from("venues").select("id, name").eq("org_id", session.orgId).order("name"),
    supabase.from("companies").select("id, name").eq("org_id", session.orgId).is("deactivated_at", null).order("name"),
  ]);
  return {
    categories: (categories ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
    venues: (venues ?? []).map((v) => ({ id: v.id as string, name: v.name as string })),
    companies: (companies ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
  };
}

/** REQ-DSC-003/005: title/abstract (FTS on `search_vector`), tags, presenter display name, company
 *  name and material title all OR together into one match set; category/venue/level/language/date
 *  are plain AND'd filters. Every query below goes through the caller's own RLS-bound client, so
 *  `sessions_read`/`materials_read`/etc. are the only tenancy and visibility boundary — this
 *  function adds no policy of its own (REQ-TEN-003, REQ-MAT-006, REQ-PRF-004). */
export async function searchSessions(locale: string, filters: SearchFilters): Promise<SearchResultSession[]> {
  const parsed = searchFiltersInput.parse(filters);
  const { supabase } = await sessionClient(locale);

  let query = supabase.from("sessions").select("id, title, abstract, category_id, level, language, venue_id, starts_at, state");
  if (parsed.categoryId) query = query.eq("category_id", parsed.categoryId);
  if (parsed.venueId) query = query.eq("venue_id", parsed.venueId);
  if (parsed.level) query = query.eq("level", parsed.level);
  if (parsed.language) query = query.eq("language", parsed.language);
  if (parsed.dateFrom) query = query.gte("starts_at", parsed.dateFrom);
  if (parsed.dateTo) query = query.lte("starts_at", parsed.dateTo);

  const [{ data: rows, error }, matchedByText] = await Promise.all([
    query.order("starts_at", { ascending: true }),
    parsed.q || parsed.companyId || parsed.presenter ? findSessionIdsByTextFilters(supabase, parsed) : Promise.resolve(null),
  ]);
  if (error) throw new Error(`sessions: ${error.message}`);

  const filtered = matchedByText === null ? (rows ?? []) : (rows ?? []).filter((r) => matchedByText.has(r.id as string));

  return filtered.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    abstract: r.abstract as string,
    level: r.level as string,
    language: r.language as string,
    startsAt: (r.starts_at as string | null) ?? null,
    state: r.state as string,
  }));
}

/** Every text/company/presenter condition ORs together into one set of matching session ids —
 *  `searchSessions` intersects it with the plain AND'd filters above. Each sub-query goes through
 *  the same RLS-bound client, so an org's own tenancy and material-availability boundaries apply
 *  automatically (see this module's header). */
async function findSessionIdsByTextFilters(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  parsed: SearchFilters,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const normalizedQuery = parsed.q ? arNormalize(parsed.q) : null;

  const tasks: PromiseLike<void>[] = [];

  if (normalizedQuery) {
    tasks.push(
      supabase
        .from("sessions")
        .select("id")
        .textSearch("search_vector", normalizedQuery, { type: "plain", config: "simple" })
        .then(({ data }) => {
          for (const r of data ?? []) ids.add(r.id as string);
        }),
    );
    tasks.push(
      supabase
        .from("tags")
        .select("id, session_tags(session_id)")
        .ilike("normalised", `%${normalizedQuery}%`)
        .then(({ data }) => {
          for (const t of data ?? []) for (const st of (t as { session_tags: { session_id: string }[] }).session_tags ?? []) ids.add(st.session_id);
        }),
    );
    tasks.push(
      // REQ-DSC-007: metadata only — `title`, never a document's own content.
      supabase
        .from("materials")
        .select("session_id, title")
        .then(({ data }) => {
          for (const m of data ?? []) if (arNormalize(m.title as string).includes(normalizedQuery)) ids.add(m.session_id as string);
        }),
    );
  }

  if (normalizedQuery || parsed.presenter) {
    const needle = normalizedQuery ?? arNormalize(parsed.presenter!);
    tasks.push(
      supabase
        .from("session_presenters")
        .select("session_id, accepted, members(display_name)")
        .eq("accepted", true)
        .then(({ data }) => {
          for (const sp of data ?? []) {
            const name = (sp as unknown as { members: { display_name: string } | null }).members?.display_name;
            if (name && arNormalize(name).includes(needle)) ids.add(sp.session_id as string);
          }
        }),
    );
  }

  if (parsed.companyId) {
    tasks.push(
      supabase
        .from("session_presenters")
        .select("session_id, accepted, members!inner(company_id)")
        .eq("accepted", true)
        .eq("members.company_id", parsed.companyId)
        .then(({ data }) => {
          for (const sp of data ?? []) ids.add(sp.session_id as string);
        }),
    );
  }

  await Promise.all(tasks);
  return ids;
}
