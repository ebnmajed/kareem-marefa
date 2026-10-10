import "server-only";
import { z } from "zod";
import { readAll } from "@/lib/dal/admin-paging";
import { avatarHref } from "@/lib/dal/avatars";
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

export interface AuditFilterOptions {
  /** Null for a moderator: their log is already only their own. */
  actors: { id: string; displayName: string | null }[] | null;
  actions: string[];
  subjectTypes: string[];
  /** ★ wave 22: the configuration history's scopes, for an admin — `config.<scope>` in the action filter. Empty for a
   *  moderator, who reads no history (0004). */
  configScopes?: string[];
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

  // The newest 5000 — paged, because an unranged read stops at `max_rows` (1000) and the old `.limit(5000)` read 1000.
  const rows = await readAll(
    "audit_log",
    (from, to) => supabase.from("audit_log").select("id, action, subject_type, actor_id").order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
    5000,
  );
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
  const history = await readAll(
    "scoring_config_history",
    (from, to) => supabase.from("scoring_config_history").select("id, scope").order("changed_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
    5000,
  );
  const configScopes = Array.from(new Set(history.map((h) => h.scope as string))).sort();
  return { actors, actions, subjectTypes, configScopes };
}

// ── SCR-062, wave 22 — both stores, marked by kind (`REQ-UIX-099`, `DEC-231` §4.3, add-only) ────────────────────────
//
// The owner's sentence is «the audit log answers who did this … for EVERYTHING these screens can do», and half of
// them write `scoring_config_history` (`DEC-148`) rather than `audit_log`. The screen therefore reads both, side by
// side, each row marked by its kind — and NOTHING IS WRITTEN TWICE: the two stores stand as `DEC-148` split them.
//
//  · The history is an ADMIN's to read (`config_history_read_admin`, 0004), so a moderator's feed is the log alone —
//    their own actions — exactly as before (`REQ-ADM-020`); the DAL does not even ask.
//  · One history row is one changed field: its old and new value, as written. Not grouped per save — a group would
//    straddle a page, and «this field, from → to» is what the row honestly holds.
//  · ONE CURSOR, TWO STREAMS. Both are ordered `(at desc, id desc)`; each is asked for a page strictly older than the
//    cursor, the two are merged and cut, and the cursor is the last row's. Timestamps are compared as PostgREST
//    prints them — the same zone and form for both columns — so the order is Postgres's own, microseconds included.
//  · The action filter names a log action, or `config.<scope>` for the history (no log action starts `config.`).

export const CONFIG_SCOPES = ["scoring", "company_scoring", "org_settings", "badges", "levels", "perks", "streaks", "branding"] as const;
export type ConfigScope = (typeof CONFIG_SCOPES)[number];
const CONFIG_PREFIX = "config.";

/** ★ The actor's face, as the board draws it — through the one resolver (`DEC-099`), with the company's ring. */
export interface AuditActorFace {
  avatarUrl: string | null;
  /** undefined: no company (no ring); null: a company with no colour. */
  teamColor: string | null | undefined;
}

export type AuditFeedRow =
  | (AuditLogRow & { kind: "log"; subjectName: string | null; actorFace: AuditActorFace | null })
  | {
      kind: "config";
      id: string;
      actorId: string | null;
      actorName: string | null;
      actorFace: AuditActorFace | null;
      scope: ConfigScope | string;
      entityId: string | null;
      entityName: string | null;
      field: string;
      oldValue: unknown;
      newValue: unknown;
      occurredAt: string;
    };

export interface AuditFeedPage {
  rows: AuditFeedRow[];
  nextBefore: string | null;
  /** How many rows match the filters, across both stores and every page. */
  total: number;
}

const isConfigAction = (action: string | undefined) => !!action && action.startsWith(CONFIG_PREFIX);

/** Older first is false: `a` sorts before `b` when it is NEWER — `(at desc, id desc)`. */
function newerFirst(a: { occurredAt: string; id: string }, b: { occurredAt: string; id: string }): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt > b.occurredAt ? -1 : 1;
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
}

/** The actors' faces: the avatar's version and the company's colour, read under RLS like their names. */
async function facesFor(supabase: Supabase, ids: string[]): Promise<Map<string, AuditActorFace>> {
  const faces = new Map<string, AuditActorFace>();
  if (ids.length === 0) return faces;
  const { data, error } = await supabase.from("members").select("id, avatar_version, avatar_key, company_id, companies(team_color)").in("id", ids);
  if (error) throw new Error(`members (faces): ${error.message}`);
  for (const m of (data ?? []) as unknown as { id: string; avatar_version: number | string | null; avatar_key?: string | null; company_id: string | null; companies: { team_color: string | null } | null }[]) {
    faces.set(m.id, { avatarUrl: avatarHref({ id: m.id, avatarVersion: m.avatar_version, avatarKey: m.avatar_key }, 96), teamColor: m.company_id ? (m.companies?.team_color ?? null) : undefined });
  }
  return faces;
}

/** Display names for the subjects a log row names, where the subject's table carries one the admin may read. */
async function subjectNames(supabase: Supabase, rows: { subjectType: string | null; subjectId: string | null }[]): Promise<Map<string, string>> {
  const tables: Record<string, { table: string; column: string }> = {
    member: { table: "members", column: "display_name" },
    session: { table: "sessions", column: "title" },
    venue: { table: "venues", column: "name" },
    category: { table: "categories", column: "name" },
    company: { table: "companies", column: "name" },
  };
  const names = new Map<string, string>();
  for (const [type, { table, column }] of Object.entries(tables)) {
    const ids = Array.from(new Set(rows.filter((r) => r.subjectType === type && r.subjectId).map((r) => r.subjectId as string)));
    if (ids.length === 0) continue;
    const { data, error } = await supabase.from(table).select(`id, ${column}`).in("id", ids);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, string | null>[]) if (row[column]) names.set(row.id as string, row[column] as string);
  }
  return names;
}

/** The names of the configuration a history row changed, where its table carries one. */
async function entityNames(supabase: Supabase, rows: { scope: string; entityId: string | null }[]): Promise<Map<string, string>> {
  const tables: Record<string, { table: string; column: string }> = {
    badges: { table: "badges", column: "name" },
    levels: { table: "levels", column: "name" },
    scoring: { table: "scoring_rules", column: "action_key" },
    company_scoring: { table: "company_scoring_rules", column: "action_key" },
    perks: { table: "perks", column: "key" },
    streaks: { table: "streak_rules", column: "key" },
  };
  const names = new Map<string, string>();
  for (const [scope, { table, column }] of Object.entries(tables)) {
    const ids = Array.from(new Set(rows.filter((r) => r.scope === scope && r.entityId).map((r) => r.entityId as string)));
    if (ids.length === 0) continue;
    const { data, error } = await supabase.from(table).select(`id, ${column}`).in("id", ids);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, string | null>[]) if (row[column]) names.set(row.id as string, row[column] as string);
  }
  return names;
}

export async function listAuditFeed(locale: string, filters: AuditFilters, timeZone: string, pageSize: number = AUDIT_PAGE_SIZE): Promise<AuditFeedPage | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const parsed = auditFiltersInput.parse(filters);
  const { session, supabase } = client;
  const bounds = periodBounds(parsed, timeZone);
  const cursor = parsed.before ? parsed.before.split("~") : null;
  const older = (at: string) => (cursor ? `${at}.lt."${cursor[0]}",and(${at}.eq."${cursor[0]}",id.lt.${cursor[1]})` : null);

  const wantLog = !isConfigAction(parsed.action);
  // The history is an admin's alone (0004), and a subject-type filter is the log's vocabulary.
  const wantConfig = session.role === "admin" && !parsed.subjectType && (!parsed.action || isConfigAction(parsed.action));

  // The same filters on both stores — actor, subject, period — each in its own column names.
  const logQuery = (columns: string, head = false) => {
    let q = supabase.from("audit_log").select(columns, head ? { count: "exact", head: true } : undefined);
    if (parsed.actor === "system") q = q.is("actor_id", null);
    else if (parsed.actor) q = q.eq("actor_id", parsed.actor);
    if (parsed.subjectId) q = q.eq("subject_id", parsed.subjectId);
    if (bounds.from) q = q.gte("occurred_at", bounds.from);
    if (bounds.until) q = q.lt("occurred_at", bounds.until);
    if (parsed.action) q = q.eq("action", parsed.action);
    if (parsed.subjectType) q = q.eq("subject_type", parsed.subjectType);
    return q;
  };
  const configQuery = (columns: string, head = false) => {
    let q = supabase.from("scoring_config_history").select(columns, head ? { count: "exact", head: true } : undefined);
    if (parsed.actor === "system") q = q.is("actor_id", null);
    else if (parsed.actor) q = q.eq("actor_id", parsed.actor);
    if (parsed.subjectId) q = q.eq("entity_id", parsed.subjectId);
    if (bounds.from) q = q.gte("changed_at", bounds.from);
    if (bounds.until) q = q.lt("changed_at", bounds.until);
    if (isConfigAction(parsed.action)) q = q.eq("scope", parsed.action!.slice(CONFIG_PREFIX.length));
    return q;
  };
  const LOG_COLUMNS = "id, actor_id, actor_role, action, subject_type, subject_id, reason, occurred_at";
  const CONFIG_COLUMNS = "id, scope, entity_id, field, old_value, new_value, actor_id, changed_at";

  const [logPage, configPage, logCount, configCount] = await Promise.all([
    wantLog
      ? (() => {
          let q = logQuery(LOG_COLUMNS).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize + 1);
          const c = older("occurred_at");
          if (c) q = q.or(c);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    wantConfig
      ? (() => {
          let q = configQuery(CONFIG_COLUMNS).order("changed_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize + 1);
          const c = older("changed_at");
          if (c) q = q.or(c);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    wantLog ? logQuery("id", true) : Promise.resolve({ count: 0, error: null }),
    wantConfig ? configQuery("id", true) : Promise.resolve({ count: 0, error: null }),
  ]);
  for (const [label, r] of [["audit_log", logPage], ["scoring_config_history", configPage], ["audit_log (count)", logCount], ["scoring_config_history (count)", configCount]] as const) {
    if (r.error) throw new Error(`${label}: ${(r.error as { message: string }).message}`);
  }

  type LogRaw = { id: string; actor_id: string | null; actor_role: string | null; action: string; subject_type: string | null; subject_id: string | null; reason: string | null; occurred_at: string };
  type ConfigRaw = { id: string; scope: string; entity_id: string | null; field: string; old_value: unknown; new_value: unknown; actor_id: string | null; changed_at: string };
  const merged = [
    ...((logPage.data ?? []) as unknown as LogRaw[]).map((r) => ({ kind: "log" as const, id: r.id, occurredAt: r.occurred_at, raw: r })),
    ...((configPage.data ?? []) as unknown as ConfigRaw[]).map((r) => ({ kind: "config" as const, id: r.id, occurredAt: r.changed_at, raw: r })),
  ].sort(newerFirst);
  const page = merged.slice(0, pageSize);
  const last = page.at(-1);
  const nextBefore = merged.length > pageSize && last ? `${last.occurredAt}~${last.id}` : null;

  const actorIds = Array.from(new Set(page.map((p) => p.raw.actor_id).filter((id): id is string => id !== null)));
  const logs = page.filter((p) => p.kind === "log").map((p) => p.raw as LogRaw);
  const configs = page.filter((p) => p.kind === "config").map((p) => p.raw as ConfigRaw);
  const [names, faces, subjects, entities] = await Promise.all([
    namesFor(supabase, actorIds),
    facesFor(supabase, actorIds),
    subjectNames(supabase, logs.map((r) => ({ subjectType: r.subject_type, subjectId: r.subject_id }))),
    entityNames(supabase, configs.map((r) => ({ scope: r.scope, entityId: r.entity_id }))),
  ]);

  return {
    rows: page.map((p): AuditFeedRow => {
      const actorName = p.raw.actor_id ? (names.get(p.raw.actor_id) ?? null) : null;
      const actorFace = p.raw.actor_id ? (faces.get(p.raw.actor_id) ?? null) : null;
      if (p.kind === "log") {
        const r = p.raw as LogRaw;
        return {
          kind: "log",
          id: r.id,
          actorId: r.actor_id,
          actorName,
          actorFace,
          actorRole: r.actor_role,
          action: r.action,
          subjectType: r.subject_type,
          subjectId: r.subject_id,
          subjectName: r.subject_id ? (subjects.get(r.subject_id) ?? null) : null,
          reason: r.reason,
          occurredAt: r.occurred_at,
        };
      }
      const r = p.raw as ConfigRaw;
      return {
        kind: "config",
        id: r.id,
        actorId: r.actor_id,
        actorName,
        actorFace,
        scope: r.scope,
        entityId: r.entity_id,
        entityName: r.entity_id ? (entities.get(r.entity_id) ?? null) : null,
        field: r.field,
        oldValue: r.old_value,
        newValue: r.new_value,
        occurredAt: r.changed_at,
      };
    }),
    nextBefore,
    total: (logCount.count ?? 0) + (configCount.count ?? 0),
  };
}
