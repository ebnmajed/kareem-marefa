import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// SCR-062 · /app/admin/audit (REQ-ADM-018). Staff — admin sees the whole
// org's log, a moderator sees only their own actions: `audit_read_admin`/
// `audit_read_moderator_own` (0004, 03 §5.10a) already draw that boundary
// at the row level, so this module adds no role filter of its own — the
// same query, run as a moderator, comes back pre-scoped by RLS. Nobody can
// write here: `revoke insert, update, delete … from anon, authenticated,
// service_role` (0004) makes append-only a privilege fact, and every write
// goes through `write_audit()`, called only from inside the transaction
// that performs the audited act.
//
// ★ Wave 8 (`DEC-147`, K1) — four things the screen got wrong, fixed at the data:
//
//  · THE DATE RANGE IS THE ORG'S DAY. «إلى تاريخ 17 سبتمبر» used to compare
//    `occurred_at <= '2026-09-17'` — midnight, UTC — so it excluded the very
//    day it named, and both bounds were UTC midnights rather than the org's.
//    A day now runs from its start in `org_settings.time_zone` to the start of
//    the NEXT day, exclusive.
//  · A PAGE, AND A WAY TO THE NEXT. Fifty rows, newest first, and a keyset
//    cursor (`occurred_at~id`) to the older ones — never an offset, which a
//    log appended to while it is being read would skip or repeat rows under.
//    The old silent 200-row cap said nothing when it cut the log short.
//  · ONE SUBJECT CAN BE FOLLOWED. `subjectId` narrows to everything that
//    happened to one member, one session, one comment.
//  · FORMER STAFF STAY FILTERABLE, and so does «النظام» (a null actor).

export const AUDIT_PAGE_SIZE = 50;

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  reason: string | null;
  occurredAt: string;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  /** The cursor for the next (older) page, or null when this is the last. */
  nextBefore: string | null;
}

export const AUDIT_PERIODS = ["7d", "30d", "month", "custom"] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const auditFiltersInput = z.object({
  /** A member id, or «system» for the rows no member wrote. */
  actor: z.union([z.uuid(), z.literal("system")]).optional(),
  action: z.string().regex(/^[a-z_]+\.[a-z_]+$/).optional(),
  subjectType: z.string().regex(/^[a-z_]+$/).optional(),
  subjectId: z.uuid().optional(),
  period: z.enum(AUDIT_PERIODS).optional(),
  from: z.string().regex(DATE).optional(),
  to: z.string().regex(DATE).optional(),
  before: z.string().regex(/^[0-9T:.+\-]+~[0-9a-f-]{36}$/).optional(),
});
export type AuditFilters = z.infer<typeof auditFiltersInput>;

/**
 * The URL's query, as filters — every value that does not parse is DROPPED
 * rather than refused: a hand-edited or stale link shows the unfiltered log,
 * not an error page. `period=custom` with `from` after `to` is reported, not
 * silently swapped.
 */
export function auditFiltersFrom(query: Record<string, string | string[] | undefined>): { filters: AuditFilters; rangeInverted: boolean } {
  const one = (key: string) => {
    const value = query[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const filters: AuditFilters = {};
  for (const key of Object.keys(auditFiltersInput.shape) as (keyof AuditFilters)[]) {
    const candidate = one(key === "subjectType" ? "subject" : key);
    if (candidate === undefined) continue;
    const parsed = auditFiltersInput.shape[key].safeParse(candidate);
    if (parsed.success) (filters as Record<string, unknown>)[key] = parsed.data;
  }
  const rangeInverted = filters.period === "custom" && !!filters.from && !!filters.to && filters.from > filters.to;
  return { filters, rangeInverted };
}

/** The instant a calendar day starts in `timeZone`, as ISO. DST-safe: the offset is read at that day, twice. */
export function dayStartInZone(date: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const parts = format.formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    guess = target - (wall - guess);
  }
  return new Date(guess).toISOString();
}

/** The calendar date `days` after `date` — pure date arithmetic, no zone. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today's calendar date in `timeZone`. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * The half-open instant range a period covers — `[from, until)` — in the org's
 * zone. A preset counts TODAY as one of its days: «آخر 7 أيام» is today and the
 * six before it.
 */
export function periodBounds(filters: Pick<AuditFilters, "period" | "from" | "to">, timeZone: string, now: Date = new Date()): { from?: string; until?: string } {
  const today = todayInZone(timeZone, now);
  switch (filters.period) {
    case "7d":
      return { from: dayStartInZone(addDays(today, -6), timeZone) };
    case "30d":
      return { from: dayStartInZone(addDays(today, -29), timeZone) };
    case "month":
      return { from: dayStartInZone(`${today.slice(0, 8)}01`, timeZone) };
    case "custom": {
      if (filters.from && filters.to && filters.from > filters.to) return {};
      return {
        from: filters.from ? dayStartInZone(filters.from, timeZone) : undefined,
        until: filters.to ? dayStartInZone(addDays(filters.to, 1), timeZone) : undefined,
      };
    }
    default:
      return {};
  }
}

async function requireStaff(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" || client.session.role === "moderator" ? client : null;
}

type Supabase = Awaited<ReturnType<typeof sessionClient>>["supabase"];

async function namesFor(supabase: Supabase, ids: string[]): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  if (ids.length === 0) return names;
  const { data, error } = await supabase.from("members").select("id, display_name").in("id", ids);
  if (error) throw new Error(`members: ${error.message}`);
  for (const m of data ?? []) names.set(m.id as string, m.display_name as string | null);
  return names;
}

export async function listAuditLog(locale: string, filters: AuditFilters, timeZone: string): Promise<AuditLogPage | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const parsed = auditFiltersInput.parse(filters);
  const { supabase } = client;

  let query = supabase
    .from("audit_log")
    .select("id, actor_id, actor_role, action, subject_type, subject_id, reason, occurred_at")
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AUDIT_PAGE_SIZE + 1);
  if (parsed.actor === "system") query = query.is("actor_id", null);
  else if (parsed.actor) query = query.eq("actor_id", parsed.actor);
  if (parsed.action) query = query.eq("action", parsed.action);
  if (parsed.subjectType) query = query.eq("subject_type", parsed.subjectType);
  if (parsed.subjectId) query = query.eq("subject_id", parsed.subjectId);
  const { from, until } = periodBounds(parsed, timeZone);
  if (from) query = query.gte("occurred_at", from);
  if (until) query = query.lt("occurred_at", until);
  if (parsed.before) {
    const [at, id] = parsed.before.split("~");
    // Quoted: an ISO timestamp carries `:` and `+`, which PostgREST's logic
    // tree would otherwise read as syntax.
    query = query.or(`occurred_at.lt."${at}",and(occurred_at.eq."${at}",id.lt.${id})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`audit_log: ${error.message}`);
  const all = data ?? [];
  const rows = all.slice(0, AUDIT_PAGE_SIZE);
  const last = rows.at(-1);
  const nextBefore = all.length > AUDIT_PAGE_SIZE && last ? `${last.occurred_at as string}~${last.id as string}` : null;

  const names = await namesFor(supabase, Array.from(new Set(rows.map((r) => r.actor_id as string | null).filter((id): id is string => id !== null))));
  return {
    rows: rows.map((r) => ({
      id: r.id as string,
      actorId: r.actor_id as string | null,
      actorName: r.actor_id ? (names.get(r.actor_id as string) ?? null) : null,
      actorRole: r.actor_role as string | null,
      action: r.action as string,
      subjectType: r.subject_type as string | null,
      subjectId: r.subject_id as string | null,
      reason: r.reason as string | null,
      occurredAt: r.occurred_at as string,
    })),
    nextBefore,
  };
}

export interface AuditFilterOptions {
  /** Null for a moderator: their log is already only their own. */
  actors: { id: string; displayName: string | null }[] | null;
  actions: string[];
  subjectTypes: string[];
}

/**
 * The filter's choices, read from the log itself (RLS-scoped like the rows),
 * so they cannot drift from what every track's `write_audit()` calls write.
 * The actor list is the current staff AND everyone who appears in the log —
 * a moderator demoted last month still wrote what they wrote.
 */
export async function listAuditFilterOptions(locale: string): Promise<AuditFilterOptions | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const { data, error } = await supabase.from("audit_log").select("action, subject_type, actor_id").order("occurred_at", { ascending: false }).limit(5000);
  if (error) throw new Error(`audit_log: ${error.message}`);
  const rows = data ?? [];
  const actions = Array.from(new Set(rows.map((r) => r.action as string))).sort();
  const subjectTypes = Array.from(new Set(rows.map((r) => r.subject_type as string | null).filter((s): s is string => s !== null))).sort();

  if (session.role !== "admin") return { actors: null, actions, subjectTypes };

  const { data: staff, error: staffError } = await supabase.from("members").select("id, display_name").eq("org_id", session.orgId).in("org_role", ["admin", "moderator"]);
  if (staffError) throw new Error(`members: ${staffError.message}`);
  const actorIds = new Set(rows.map((r) => r.actor_id as string | null).filter((id): id is string => id !== null));
  for (const m of staff ?? []) actorIds.delete(m.id as string);
  const former = await namesFor(supabase, Array.from(actorIds));

  const actors = [
    ...(staff ?? []).map((m) => ({ id: m.id as string, displayName: m.display_name as string | null })),
    ...Array.from(former, ([id, displayName]) => ({ id, displayName })),
  ].sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? "", "ar"));
  return { actors, actions, subjectTypes };
}
