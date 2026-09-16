// The timeline's filter state — REQ-UIX-022, REQ-DSC-005, DEC-130.
//
// ★ THE URL IS THE STATE. `/app/sessions?…` is the canonical, linkable,
// filterable address of the timeline: a tag chip on an event page, the shell's
// search box and a shared link all land on it, and every control on the
// timeline is a link to the next state of it — so a filter works before
// JavaScript has loaded, and the back button undoes one.
//
// Pure, and imported by the server page and the client sheet alike.
//
// ★ ORDER IS APPLICATION ORDER. A filter being applied is removed and appended,
// so the last entry is the most recent — which is how the filtered-empty state
// breaks a tie when two filters would each restore results on their own.
//
// ★ AN INVALID VALUE IS DROPPED, NEVER ECHOED. Each key is validated on its own:
// a hand-edited `?category=abc` is ignored rather than failing the page, and it
// never reaches a chip, where it would print a string nobody chose.

export const FILTER_KEYS = ["status", "category", "tag", "venue", "company", "level", "language", "presenter", "when", "from", "to", "q"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export type TimelineStatus = "open" | "live" | "ended";
export type TimelineLevel = "introductory" | "intermediate" | "advanced";

/** The keys row A draws as toggles; every other active key is a removable chip in row B. */
export const TOGGLE_KEYS: readonly FilterKey[] = ["status", "category"];
/** The keys the filter sheet edits. */
export const SHEET_KEYS: readonly FilterKey[] = ["when", "tag", "venue", "company", "presenter", "level", "language"];

/**
 * ★ `from` and `to` are still READ — a link someone saved or shared keeps
 * working and shows as a removable chip — but no control writes them any more
 * (DEC-141 ruling 15). The sheet's native date inputs drew the BROWSER's own
 * mask, `dd/mm/yyyy` in English under an Arabic page, and a browser set to
 * Arabic may draw Arabic-Indic digits, which DEC-124 forbids. Choosing a period
 * replaces them; clearing the sheet clears them.
 */
export const LEGACY_DATE_KEYS: readonly FilterKey[] = ["from", "to"];

export interface TimelineQuery {
  /** Validated, in application order, one per key. */
  readonly entries: ReadonlyArray<readonly [FilterKey, string]>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function valid(key: FilterKey, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  switch (key) {
    case "status":
      return value === "open" || value === "live" || value === "ended" ? value : null;
    case "category":
    case "venue":
    case "company":
      return UUID.test(value) ? value.toLowerCase() : null;
    case "level":
      return value === "introductory" || value === "intermediate" || value === "advanced" ? value : null;
    case "language":
      return value === "ar" || value === "en" ? value : null;
    case "when":
      return value === "thisWeek" || value === "nextWeek" || value === "thisMonth" ? value : null;
    case "from":
    case "to":
      return DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null;
    case "tag":
      return value.length <= 60 ? value : null;
    case "presenter":
    case "q":
      return value.length <= 200 ? value : null;
  }
}

const isKey = (key: string): key is FilterKey => (FILTER_KEYS as readonly string[]).includes(key);

type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

export function parseTimelineQuery(params: SearchParamsLike): TimelineQuery {
  const pairs: [string, string][] =
    params instanceof URLSearchParams
      ? [...params.entries()]
      : Object.entries(params).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : v === undefined ? [] : [[k, v] as [string, string]]));

  const byKey = new Map<FilterKey, string>();
  for (const [key, raw] of pairs) {
    if (!isKey(key)) continue;
    const value = valid(key, raw);
    if (value === null) continue;
    // The last occurrence wins and moves to the end, like applying it again.
    byKey.delete(key);
    byKey.set(key, value);
  }
  return { entries: [...byKey.entries()] };
}

export function getFilter(query: TimelineQuery, key: FilterKey): string | undefined {
  return query.entries.find(([k]) => k === key)?.[1];
}

/** Apply one filter: replace any value it had, and make it the most recent. */
export function withFilter(query: TimelineQuery, key: FilterKey, value: string): TimelineQuery {
  const checked = valid(key, value);
  const rest = query.entries.filter(([k]) => k !== key);
  return { entries: checked === null ? rest : [...rest, [key, checked] as const] };
}

/** Drop one filter and keep every other one (REQ-UIX-022). */
export function withoutFilter(query: TimelineQuery, key: FilterKey): TimelineQuery {
  return { entries: query.entries.filter(([k]) => k !== key) };
}

export function isFiltered(query: TimelineQuery): boolean {
  return query.entries.length > 0;
}

/** The canonical URL of a timeline state — always `/app/sessions`, never `/app` (DEC-130). */
export function timelineHref(query: TimelineQuery): string {
  if (query.entries.length === 0) return "/app/sessions";
  const params = new URLSearchParams();
  for (const [key, value] of query.entries) params.append(key, value);
  return `/app/sessions?${params.toString()}`;
}

/** Every active filter that row B draws as a removable chip, in application order. */
export function chipEntries(query: TimelineQuery): ReadonlyArray<readonly [FilterKey, string]> {
  return query.entries.filter(([k]) => !TOGGLE_KEYS.includes(k));
}
