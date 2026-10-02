// SCR-042's list state as pure functions — the URL is the whole state of the
// list (search, the three chips, the sort, the page), so it survives a reload,
// a shared link and a browser with no JS (`REQ-UIX-087`, `REQ-NFR-007`).
// No `server-only`: the table is a client component and builds the same URLs.
// `lib/dal/admin-sessions.ts` reads the rows; this file only shapes them.
import type { SessionState } from "@/lib/dal/sessions";
import type { SeatState, SessionPhase } from "@/lib/session-status";

export interface ConsolePresenter {
  memberId: string;
  displayName: string | null;
  avatarUrl: string | null;
  teamColor: string | null;
  accepted: boolean;
  declinedAt: string | null;
}

export interface ConsoleSessionRow {
  id: string;
  title: string;
  state: SessionState;
  /** The derived phase every surface reads (`REQ-UIX-003`), clock included. */
  phase: SessionPhase;
  seat: SeatState;
  startsAt: string | null;
  endsAt: string | null;
  dayCount: number;
  venueName: string | null;
  capacity: number | null;
  /** Confirmed reservations — cancelled and late-cancelled rows are not seats. */
  confirmed: number;
  waitlisted: number;
  categoryId: string | null;
  presenters: ConsolePresenter[];
  /** `YYYY-MM` of the start on the org's clock; `null` when undated. */
  monthKey: string | null;
}

/** `YYYY-MM` on `timeZone`'s calendar — the month filter's and the dashboard's month. */
export function monthKeyOf(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

// ── The URL's state, as pure functions ───────────────────────────────────────

export const SESSION_STATUS_FILTERS = ["draft", "pending_schedule", "open", "live", "ended", "cancelled"] as const satisfies readonly SessionPhase[];
export const SESSION_SORT_KEYS = ["default", "title", "status", "start", "venue", "presenter", "seats"] as const;
export type SessionSortKey = (typeof SESSION_SORT_KEYS)[number];

/** Rows per page — the artboard's nine (`AdminSessions.dc.html`, «1 – 9 من 41»). */
export const SESSIONS_PAGE_SIZE = 9;

/** `?month=none` — the undated sessions, the dashboard's «جلسات لم تُجدول بعد» (`DEC-228` §3.2). */
export const MONTH_NONE = "none";

export interface SessionQuery {
  q: string;
  status: SessionPhase | null;
  category: string | null;
  /** `YYYY-MM`, `none`, or null for every month. */
  month: string | null;
  sort: SessionSortKey;
  dir: "asc" | "desc";
  page: number;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the list's state from the URL. Anything unrecognised is the default, never an error. */
export function parseSessionQuery(params: Record<string, string | string[] | undefined>): SessionQuery {
  const q = (first(params.q) ?? "").trim().slice(0, 200);
  const status = first(params.status);
  const category = first(params.category);
  const month = first(params.month);
  const sort = first(params.sort);
  const dir = first(params.dir);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    q,
    status: (SESSION_STATUS_FILTERS as readonly string[]).includes(status ?? "") ? (status as SessionPhase) : null,
    category: category && UUID_RE.test(category) ? category : null,
    month: month === MONTH_NONE || (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) ? month : null,
    sort: (SESSION_SORT_KEYS as readonly string[]).includes(sort ?? "") ? (sort as SessionSortKey) : "default",
    dir: dir === "desc" ? "desc" : "asc",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Arabic-aware enough for a search box: case, surrounding space, and the alef and taa marbuta forms people type interchangeably. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/** The undated predicate — the same one `getAdminAttention()`'s «جلسات لم تُجدول بعد» counts. */
export function isUndated(row: Pick<ConsoleSessionRow, "startsAt" | "state">): boolean {
  return row.startsAt === null && row.state !== "cancelled" && row.state !== "archived";
}

export function filterSessions(rows: readonly ConsoleSessionRow[], query: SessionQuery): ConsoleSessionRow[] {
  const needle = normalizeSearch(query.q);
  return rows.filter((r) => {
    if (needle && !normalizeSearch(r.title).includes(needle) && !r.presenters.some((p) => normalizeSearch(p.displayName ?? "").includes(needle))) return false;
    if (query.status && r.phase !== query.status) return false;
    if (query.category && r.categoryId !== query.category) return false;
    if (query.month === MONTH_NONE && !isUndated(r)) return false;
    if (query.month && query.month !== MONTH_NONE && r.monthKey !== query.month) return false;
    return true;
  });
}

const PHASE_ORDER: Record<SessionPhase, number> = { live: 0, open: 1, pending_schedule: 2, draft: 3, ended: 4, cancelled: 5 };

/** The artboard's default order (`DEC-228` §3.5): live, then upcoming by date ascending, then undated, then past by date descending. */
function defaultGroup(r: ConsoleSessionRow): number {
  if (r.phase === "live") return 0;
  if (r.startsAt === null) return 2;
  if (r.phase === "ended" || r.phase === "cancelled") return 3;
  return 1;
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

export function sortSessions(rows: readonly ConsoleSessionRow[], sort: SessionSortKey, dir: "asc" | "desc"): ConsoleSessionRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const byTitle = (a: ConsoleSessionRow, b: ConsoleSessionRow) => a.title.localeCompare(b.title, "ar");
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "default": {
        const ga = defaultGroup(a);
        const gb = defaultGroup(b);
        if (ga !== gb) return ga - gb;
        const ta = time(a.startsAt) ?? 0;
        const tb = time(b.startsAt) ?? 0;
        if (ga === 3) return tb - ta || byTitle(a, b);
        return ta - tb || byTitle(a, b);
      }
      case "start": {
        // Undated sorts last in either direction — a null date is not «earliest» (kept from wave 6).
        const ta = time(a.startsAt);
        const tb = time(b.startsAt);
        if (ta === null && tb === null) return byTitle(a, b);
        if (ta === null) return 1;
        if (tb === null) return -1;
        return (ta - tb) * sign;
      }
      case "status":
        return (PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]) * sign || byTitle(a, b);
      case "venue":
        return (a.venueName ?? "").localeCompare(b.venueName ?? "", "ar") * sign || byTitle(a, b);
      case "presenter":
        return (a.presenters[0]?.displayName ?? "").localeCompare(b.presenters[0]?.displayName ?? "", "ar") * sign || byTitle(a, b);
      case "seats":
        return (a.confirmed - b.confirmed) * sign || byTitle(a, b);
      case "title":
      default:
        return byTitle(a, b) * sign;
    }
  });
}

export interface SessionPage {
  rows: ConsoleSessionRow[];
  /** The filtered total — «41 جلسة». */
  total: number;
  page: number;
  pageCount: number;
  /** 1-based positions of the first and last row on the page; 0 and 0 when empty. */
  from: number;
  to: number;
}

export function pageSessions(rows: readonly ConsoleSessionRow[], query: SessionQuery): SessionPage {
  const sorted = sortSessions(filterSessions(rows, query), query.sort, query.dir);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / SESSIONS_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * SESSIONS_PAGE_SIZE;
  const slice = sorted.slice(start, start + SESSIONS_PAGE_SIZE);
  return { rows: slice, total, page, pageCount, from: slice.length ? start + 1 : 0, to: start + slice.length };
}

/** The list's URL for a changed query — params at their default are left out, so the plain URL is the default list. */
export function sessionsHref(query: SessionQuery, change: Partial<SessionQuery> = {}): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status) params.set("status", next.status);
  if (next.category) params.set("category", next.category);
  if (next.month) params.set("month", next.month);
  if (next.sort !== "default") params.set("sort", next.sort);
  if (next.sort !== "default" && next.dir === "desc") params.set("dir", "desc");
  if (next.page > 1) params.set("page", String(next.page));
  const s = params.toString();
  return s ? `/app/admin/sessions?${s}` : "/app/admin/sessions";
}
