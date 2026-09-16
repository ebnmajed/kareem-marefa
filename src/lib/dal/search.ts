import "server-only";
import { sessionClient } from "@/lib/dal/session";
import { getSessionPoster } from "@/lib/dal/posters";
import { getFilter, type FilterKey, type TimelineQuery, type TimelineStatus } from "@/components/browse/timeline-query";
import { matchesTimeline } from "@/components/browse/timeline-match";
import { arNormalize } from "@/components/browse/ar-normalize";
import {
  TIMELINE_SESSION_COLUMNS,
  TIMELINE_STATES,
  finishTimelineSession,
  groupPresenters,
  groupTags,
  toTimelineCandidate,
  type CandidateContext,
  type TagEntry,
  type TimelineCandidate,
  type TimelineSession,
} from "@/components/browse/timeline-session";

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

export interface SearchFilterOptions {
  categories: { id: string; name: string }[];
  venues: { id: string; name: string }[];
  companies: { id: string; name: string }[];
}

export type { TimelineSession } from "@/components/browse/timeline-session";

export interface TimelineData {
  status: "upcoming" | TimelineStatus;
  /** The viewer's next committed session — the FIRST ITEM of the timeline (REQ-UIX-021), not repeated below. */
  pinned: TimelineSession | null;
  items: TimelineSession[];
  /** Everything that matched, the pinned item included. */
  total: number;
  /** Whether anything exists at all, filters aside — for the empty state's wording. */
  exists: { upcoming: boolean; ended: boolean };
  /** For a filtered-empty result: the one filter whose removal restores the most (REQ-UIX-022). */
  dropOne: { key: FilterKey; count: number } | null;
  options: SearchFilterOptions & { tags: { label: string; normalised: string; count: number }[]; presenters: string[] };
  orgTimeZone: string;
}

// REQ-DSC-004's fold lives beside the timeline's matcher, which is pure; it is
// re-exported here for every caller that already imported it from the DAL.
export { arNormalize } from "@/components/browse/ar-normalize";

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

/** The ended view shows the most recent this many; older pages are a later concern (`notes/sessions.md` §24.2). */
const ENDED_LIMIT = 60;

/**
 * The sessions timeline — `/app` and `/app/sessions` — REQ-UIX-021, REQ-UIX-022,
 * REQ-DSC-003 … REQ-DSC-006, DEC-112, DEC-130.
 *
 * ★ WHAT A MEMBER CAN ATTEND. The visible set is `sessions_read` — through the
 * RLS-bound client, so tenancy and tiering are the database's — narrowed to the
 * states a member acts on. Drafts and `approved` sessions never appear here, even
 * to staff: the console lists those. The default view is what is running and
 * what is coming, plus a cancelled future session the viewer holds a seat on,
 * so they learn it was cancelled.
 *
 * ★ FILTERS APPLY IN MEMORY, over that visible set, and this is deliberate at
 * this scale (`16` §2.2a: ~30 sessions, revisit past ~200). It is what makes the
 * filtered-empty state honest for free: "removing «فني» alone would show 3" is
 * one more pass over rows already in hand, not a query per active filter. The
 * free-text search is the one filter that stays in SQL — `search_vector`, tags,
 * material titles, presenters — through `findSessionIdsByTextFilters`.
 *
 * Phase, seat and «closing soon» come from `session-status.ts`, clock included,
 * exactly as every other surface derives them (REQ-UIX-003).
 */
export async function getTimeline(locale: string, query: TimelineQuery, now: Date = new Date()): Promise<TimelineData> {
  const { session, supabase } = await sessionClient(locale);
  const statusFilter = getFilter(query, "status") as TimelineStatus | undefined;
  const q = getFilter(query, "q");

  const [sessionsRes, presentersRes, tagsRes, mineRes, bookmarksRes, textIds, categoriesRes, venuesRes, companiesRes, settingsRes, checkInsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select(TIMELINE_SESSION_COLUMNS)
      .in("state", TIMELINE_STATES)
      .order("starts_at", { ascending: true }),
    supabase.from("session_presenters").select("session_id, member_id").eq("accepted", true),
    supabase.from("session_tags").select("session_id, tags(label, normalised)"),
    supabase.from("rsvps").select("session_id, status").eq("member_id", session.memberId).in("status", ["confirmed", "waitlisted"]),
    supabase.from("bookmarks").select("session_id").eq("member_id", session.memberId),
    q ? findSessionIdsByTextFilters(supabase, { q }) : Promise.resolve(null),
    supabase.from("categories").select("id, name").eq("org_id", session.orgId).is("deactivated_at", null).order("name"),
    supabase.from("venues").select("id, name").eq("org_id", session.orgId).order("name"),
    supabase.from("companies").select("id, name").eq("org_id", session.orgId).is("deactivated_at", null).order("name"),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
    statusFilter === "ended" ? supabase.from("check_ins").select("session_id").eq("member_id", session.memberId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (sessionsRes.error) throw new Error(`sessions: ${sessionsRes.error.message}`);
  if (presentersRes.error) throw new Error(`session_presenters: ${presentersRes.error.message}`);
  if (tagsRes.error) throw new Error(`session_tags: ${tagsRes.error.message}`);
  if (mineRes.error) throw new Error(`rsvps: ${mineRes.error.message}`);

  const orgTimeZone = (settingsRes.data?.time_zone as string | undefined) ?? "Asia/Riyadh";

  const presentersBySession = groupPresenters(
    (presentersRes.data ?? []) as { session_id: string; member_id: string }[],
    await presenterProfiles(supabase, (presentersRes.data ?? []) as { member_id: string }[]),
  );
  const ctx: CandidateContext = {
    presentersBySession,
    tagsBySession: groupTags((tagsRes.data ?? []) as unknown as { session_id: string; tags: TagEntry | null }[]),
    mine: new Map(((mineRes.data ?? []) as { session_id: string; status: "confirmed" | "waitlisted" }[]).map((r) => [r.session_id, r.status])),
    bookmarked: new Set(((bookmarksRes.data ?? []) as { session_id: string }[]).map((r) => r.session_id)),
    orgTimeZone,
    now,
  };
  const attended = new Set(((checkInsRes.data ?? []) as { session_id: string }[]).map((r) => r.session_id));

  const candidates: TimelineCandidate[] = ((sessionsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => toTimelineCandidate(row, ctx));

  const matches = (c: TimelineCandidate, skip?: FilterKey) => matchesTimeline(c, query, { textIds, now, orgTimeZone, skip });
  const matched = candidates.filter((c) => matches(c));

  const sorted =
    statusFilter === "ended"
      ? matched.sort((a, b) => (b.endsAt ?? "").localeCompare(a.endsAt ?? "")).slice(0, ENDED_LIMIT)
      : matched.sort((a, b) => (a.phase === "live" ? 0 : 1) - (b.phase === "live" ? 0 : 1) || (a.startsAt ?? "9999").localeCompare(b.startsAt ?? "9999"));

  // The next committed session: the earliest open-or-live one holding a
  // CONFIRMED seat. A waitlist place is not a commitment (`16` §5.4).
  const pinnedCandidate = statusFilter === "ended" ? null : (sorted.find((c) => c.mine === "confirmed" && (c.phase === "open" || c.phase === "live")) ?? null);

  let dropOne: TimelineData["dropOne"] = null;
  if (matched.length === 0 && query.entries.length > 0) {
    for (const [key] of query.entries) {
      const count = candidates.filter((c) => matches(c, key)).length;
      // `>=`, so on a tie the later — more recently applied — filter wins.
      if (!dropOne || count >= dropOne.count) dropOne = { key, count };
    }
  }

  const finished = await finishCards(locale, supabase, sorted, attended, now);
  const pinned = pinnedCandidate ? (finished.find((s) => s.id === pinnedCandidate.id) ?? null) : null;

  // The filter sheet's vocabulary: tags by how many visible sessions carry them,
  // and every presenter's name once.
  const tagCounts = new Map<string, { label: string; normalised: string; count: number }>();
  for (const c of candidates) for (const tag of c.tags) tagCounts.set(tag.normalised, { ...tag, count: (tagCounts.get(tag.normalised)?.count ?? 0) + 1 });
  const presenterNames = [...new Set(candidates.flatMap((c) => c.presenters.map((p) => p.displayName)).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b, "ar"));

  return {
    status: statusFilter ?? "upcoming",
    pinned,
    items: pinned ? finished.filter((s) => s.id !== pinned.id) : finished,
    total: matched.length,
    exists: {
      upcoming: candidates.some((c) => c.phase === "open" || c.phase === "live"),
      ended: candidates.some((c) => c.phase === "ended"),
    },
    dropOne,
    options: {
      categories: ((categoriesRes.data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })),
      venues: ((venuesRes.data ?? []) as { id: string; name: string }[]).map((v) => ({ id: v.id, name: v.name })),
      companies: ((companiesRes.data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })),
      tags: [...tagCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ar")),
      presenters: presenterNames,
    },
    orgTimeZone,
  };
}

type Client = Awaited<ReturnType<typeof sessionClient>>["supabase"];

/** Presenters' names and companies, member tier (REQ-PRF-004), in one read. */
async function presenterProfiles(supabase: Client, rows: { member_id: string }[]): Promise<Map<string, { displayName: string | null; companyId: string | null }>> {
  const memberIds = [...new Set(rows.map((p) => p.member_id))];
  const profiles = new Map<string, { displayName: string | null; companyId: string | null }>();
  if (memberIds.length === 0) return profiles;
  const { data, error } = await supabase.from("members_member_view").select("id, display_name, company_id").in("id", memberIds);
  if (error) throw new Error(`members_member_view: ${error.message}`);
  for (const m of data ?? []) profiles.set(m.id as string, { displayName: (m.display_name as string | null) ?? null, companyId: (m.company_id as string | null) ?? null });
  return profiles;
}

/** Seats for the open cards on screen and posters for every card on screen, then the cards. */
async function finishCards(locale: string, supabase: Client, shown: TimelineCandidate[], attended: Set<string>, now: Date): Promise<TimelineSession[]> {
  const openIds = shown.filter((c) => c.phase === "open").map((c) => c.id);
  const [seatCounts, posters] = await Promise.all([
    Promise.all(openIds.map((id) => supabase.rpc("session_seat_counts", { p_session: id }).single())),
    Promise.all(shown.map((c) => getSessionPoster(locale, c.id).catch(() => null))),
  ]);
  const counts = new Map(openIds.map((id, i) => [id, (seatCounts[i].data as { confirmed_count: number; waitlist_count: number } | null) ?? { confirmed_count: 0, waitlist_count: 0 }]));
  return shown.map((c, i) => {
    const seatCount = counts.get(c.id) ?? { confirmed_count: 0, waitlist_count: 0 };
    return finishTimelineSession(
      c,
      { confirmedCount: seatCount.confirmed_count, waitlistCount: seatCount.waitlist_count, posterUrl: posters[i]?.imageUrl ?? null, attended: attended.has(c.id) },
      now,
    );
  });
}

/**
 * Cards for an explicit list of sessions, IN THE ORDER GIVEN — the same card the
 * timeline draws (`components/browse/timeline-session.ts`), for a surface that
 * already knows which sessions it wants: the member's saved sessions
 * (`getBookmarkedTimelineSessions`, SCR-024).
 *
 * Visibility is still `sessions_read` through the RLS-bound client, narrowed to
 * `TIMELINE_STATES`: an id the viewer may not see, or a draft, simply has no
 * card. No filter applies, so the whole set is read and no count is withheld.
 * Attendance is read for every listed session, not only an ended view, because
 * a saved list mixes ended sessions with coming ones.
 */
export async function getTimelineSessionsByIds(locale: string, ids: string[], now: Date = new Date()): Promise<TimelineSession[]> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return [];
  const { session, supabase } = await sessionClient(locale);

  const [sessionsRes, presentersRes, tagsRes, mineRes, bookmarksRes, settingsRes, checkInsRes] = await Promise.all([
    supabase.from("sessions").select(TIMELINE_SESSION_COLUMNS).in("id", wanted).in("state", TIMELINE_STATES),
    supabase.from("session_presenters").select("session_id, member_id").eq("accepted", true).in("session_id", wanted),
    supabase.from("session_tags").select("session_id, tags(label, normalised)").in("session_id", wanted),
    supabase.from("rsvps").select("session_id, status").eq("member_id", session.memberId).in("status", ["confirmed", "waitlisted"]).in("session_id", wanted),
    supabase.from("bookmarks").select("session_id").eq("member_id", session.memberId).in("session_id", wanted),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
    supabase.from("check_ins").select("session_id").eq("member_id", session.memberId).in("session_id", wanted),
  ]);
  if (sessionsRes.error) throw new Error(`sessions: ${sessionsRes.error.message}`);
  if (presentersRes.error) throw new Error(`session_presenters: ${presentersRes.error.message}`);
  if (tagsRes.error) throw new Error(`session_tags: ${tagsRes.error.message}`);
  if (mineRes.error) throw new Error(`rsvps: ${mineRes.error.message}`);
  if (bookmarksRes.error) throw new Error(`bookmarks: ${bookmarksRes.error.message}`);
  if (checkInsRes.error) throw new Error(`check_ins: ${checkInsRes.error.message}`);

  const presenterRows = (presentersRes.data ?? []) as { session_id: string; member_id: string }[];
  const ctx: CandidateContext = {
    presentersBySession: groupPresenters(presenterRows, await presenterProfiles(supabase, presenterRows)),
    tagsBySession: groupTags((tagsRes.data ?? []) as unknown as { session_id: string; tags: TagEntry | null }[]),
    mine: new Map(((mineRes.data ?? []) as { session_id: string; status: "confirmed" | "waitlisted" }[]).map((r) => [r.session_id, r.status])),
    bookmarked: new Set(((bookmarksRes.data ?? []) as { session_id: string }[]).map((r) => r.session_id)),
    orgTimeZone: (settingsRes.data?.time_zone as string | undefined) ?? "Asia/Riyadh",
    now,
  };
  const attended = new Set(((checkInsRes.data ?? []) as { session_id: string }[]).map((r) => r.session_id));

  const byId = new Map(((sessionsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => [row.id as string, toTimelineCandidate(row, ctx)]));
  const ordered = wanted.map((id) => byId.get(id)).filter((c): c is TimelineCandidate => c !== undefined);
  return finishCards(locale, supabase, ordered, attended, now);
}

/** Every text/company/presenter condition ORs together into one set of matching session ids —
 *  `searchSessions` intersects it with the plain AND'd filters above. Each sub-query goes through
 *  the same RLS-bound client, so an org's own tenancy and material-availability boundaries apply
 *  automatically (see this module's header). */
async function findSessionIdsByTextFilters(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  parsed: { q?: string; presenter?: string; companyId?: string },
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
