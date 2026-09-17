import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/dal/session";

// The platform console's data access — REQ-ADM-001, REQ-ADM-002, REQ-ADM-003,
// REQ-ADM-019, REQ-TEN-002, REQ-TEN-006, REQ-TEN-007, REQ-NFR-014, DEC-014.
//
// ★ THIS MODULE NEVER SELECTS FROM AN ORG'S TABLES. Every read goes through a
// `security definer` function that calls `assert_platform_admin()` first, and
// every one of those returns the org's own row, its domain list, or counts —
// never a member, a session title or a piece of content (REQ-ADM-003). A super
// admin who wants to see an org's data starts an impersonation session, and
// that lands in the org's own audit log the moment it starts (REQ-ADM-019).
//
// ★ THE CLAIM IS NEVER THE AUTHORITY. `platform_admin` on the token says who
// to *show* the console to; `assert_platform_admin()` re-reads
// `public.platform_admins` for `auth.uid()` and is what every read and write
// is actually gated on (DEC-035). A forged or stale claim buys nothing: the
// table has no policy and no grant, so the claim cannot even be verified
// client-side, let alone trusted.


export interface PlatformSession {
  userId: string;
  email: string | null;
}

/**
 * The console's gate. Redirects a signed-out visitor to sign-in and answers
 * **not found** for everyone else — the super-admin console does not announce
 * itself to an org admin who guesses the URL.
 *
 * Memoised per render pass, so a page and the components under it share one
 * round trip. Called at the data in every page, never in a layout: a layout
 * does not re-render on navigation under Partial Rendering [v16].
 */
export const requirePlatformAdmin = cache(async (locale: string, next?: string): Promise<PlatformSession> => {
  const state = await getSessionState();
  if (state.kind === "none") {
    redirect(`/${locale}/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  }
  const supabase = await createServerClient();
  // The claim is a hint; the table is the answer. The RPC raises 42501 when
  // there is no row for auth.uid().
  const { error } = await supabase.rpc("assert_platform_admin");
  if (error) notFound();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub: string; email?: string } | undefined;
  return { userId: claims?.sub ?? "", email: claims?.email ?? null };
});

/** For the shell: is this session a super admin, without redirecting. */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const state = await getSessionState();
  if (state.kind === "none") return false;
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("assert_platform_admin");
  return !error;
});

// ── SCR-080 · the org list ────────────────────────────────────────────────

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  createdAt: string;
  members: number;
  activeMembers: number;
  sessions: number;
  publishedSessions: number;
  completedSessions: number;
  certificates: number;
  /**
   * A deletion has been requested and the org still exists (`0010`): SCR-080
   * offers it nothing more — `reinstate_org()` refuses it, and a second deletion
   * or a suspension would change nothing (principle 7).
   */
  deletionPending: boolean;
}

type OrgMetricRow = {
  org_id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  created_at: string;
  members: number | string;
  active_members: number | string;
  sessions: number | string;
  published_sessions: number | string;
  completed_sessions: number | string;
  certificates: number | string;
  /** Absent before `0010`. */
  deletion_pending?: boolean;
};

// Postgres `count(*)` is bigint, which supabase-js hands back as a string once
// it exceeds the safe integer range and as a number below it. Normalise once.
const count = (v: number | string | null): number => (v === null ? 0 : typeof v === "number" ? v : Number(v));

export async function listOrgs(locale: string): Promise<OrgSummary[]> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("platform_metrics_by_org");
  if (error || !data) return [];
  return (data as OrgMetricRow[]).map((r) => ({
    id: r.org_id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    createdAt: r.created_at,
    members: count(r.members),
    activeMembers: count(r.active_members),
    sessions: count(r.sessions),
    publishedSessions: count(r.published_sessions),
    completedSessions: count(r.completed_sessions),
    certificates: count(r.certificates),
    deletionPending: r.deletion_pending === true,
  }));
}

// ── SCR-082 · one org, its domains and its counts ─────────────────────────

export interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  certificatePrefix: string;
  firstAdminEmail: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  /** See `OrgSummary.deletionPending`. Absent (false) before `0010`. */
  deletionPending: boolean;
  domains: string[];
  counts: Record<string, number>;
}

export async function getOrgDetail(locale: string, orgId: string): Promise<OrgDetail | null> {
  if (!z.uuid().safeParse(orgId).success) return null;
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("platform_org", { p_org: orgId });
  if (error || !data) return null;
  const row = data as Omit<OrgDetail, "counts" | "deletionPending"> & { counts: Record<string, number | string>; deletionPending?: boolean };
  return {
    ...row,
    deletionPending: row.deletionPending === true,
    counts: Object.fromEntries(Object.entries(row.counts ?? {}).map(([k, v]) => [k, count(v)])),
  };
}

// ── SCR-081 · create an org ───────────────────────────────────────────────

// Shape, not authority (CLAUDE.md § Validation). The slug and the prefix are
// also constrained by the table (0004), so a value that slips past this is
// still refused by Postgres rather than stored wrong.
export const createOrgInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  certificatePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/),
  domains: z.array(z.string().trim().toLowerCase().min(3).max(253)).min(1).max(10),
  firstAdminEmail: z.email().max(254),
  seedCategories: z.boolean().default(true),
});
export type CreateOrgInput = z.infer<typeof createOrgInput>;

export type PlatformWriteResult = { status: "ok"; id?: string } | { status: "failed"; message: string };

function failure(error: { message?: string } | null): PlatformWriteResult {
  // The RPCs raise stable identifiers, never prose (0005's convention); the
  // screen maps them to Arabic copy and falls back to a generic line.
  const raw = error?.message ?? "";
  // Longest first where one identifier contains another: `org_not_found`
  // would otherwise swallow `org_not_found_or_active`.
  const known = [
    "not_platform_admin",
    "domains_required",
    "reason_required",
    "org_deletion_pending",
    "org_not_found_or_active",
    "org_not_found",
    "invalid_email",
    "slug_mismatch",
    "impersonation_already_active",
    "version_not_published",
    "already_platform",
    "last_platform_default",
    "template_not_found",
    "template_retired",
  ].find((k) => raw.includes(k));
  if (known) return { status: "failed", message: known };
  // Only the slug's own constraint is «slug taken»; any other duplicate is not.
  if (raw.includes("orgs_slug_key")) return { status: "failed", message: "slug_taken" };
  return { status: "failed", message: "failed" };
}

export async function createOrg(locale: string, input: CreateOrgInput): Promise<PlatformWriteResult> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_org", {
    p_name: input.name,
    p_slug: input.slug,
    p_certificate_prefix: input.certificatePrefix,
    p_domains: input.domains,
    p_first_admin_email: input.firstAdminEmail,
    p_seed_categories: input.seedCategories,
  });
  if (error) return failure(error);
  return { status: "ok", id: data as string };
}

// ── SCR-080 · suspend, reinstate, delete ──────────────────────────────────

export async function suspendOrg(locale: string, orgId: string, reason: string): Promise<PlatformWriteResult> {
  if (!z.uuid().safeParse(orgId).success) return { status: "failed", message: "failed" };
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("suspend_org", { p_org: orgId, p_reason: reason });
  return error ? failure(error) : { status: "ok" };
}

export async function reinstateOrg(locale: string, orgId: string): Promise<PlatformWriteResult> {
  if (!z.uuid().safeParse(orgId).success) return { status: "failed", message: "failed" };
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("reinstate_org", { p_org: orgId });
  return error ? failure(error) : { status: "ok" };
}

/**
 * REQ-NFR-014. Irreversible, and distinct from suspension. The typed slug is
 * checked by the RPC against the stored one, not here: a confirmation the
 * server does not verify is a confirmation dialog, not a safety.
 */
export async function deleteOrg(locale: string, orgId: string, typedSlug: string): Promise<PlatformWriteResult> {
  if (!z.uuid().safeParse(orgId).success) return { status: "failed", message: "failed" };
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("delete_org", { p_org: orgId, p_slug_typed: typedSlug });
  return error ? failure(error) : { status: "ok" };
}

// ── SCR-082 · the first admin and the allowed domains ─────────────────────

/**
 * ★ Lowercased HERE, before the RPC (wave 8, notes W8.0 F3). `set_first_admin()`
 * checks `\.[a-z]{2,}$` against the address as sent, and Postgres regexes are
 * case-sensitive, so `Boss@Example.COM` was refused as «بريد غير صالح» — while
 * `create_org()` lowercases first and stores the same address happily. The two
 * doors now agree; the column is `citext` and stores lowercase either way.
 * (A `create or replace` of the RPC is recorded as optional hardening, DEC-148.)
 */
export async function setFirstAdmin(locale: string, orgId: string, email: string): Promise<PlatformWriteResult> {
  if (!z.uuid().safeParse(orgId).success) return { status: "failed", message: "failed" };
  const normalised = email.trim().toLowerCase();
  if (!z.email().safeParse(normalised).success) return { status: "failed", message: "invalid_email" };
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_first_admin", { p_org: orgId, p_email: normalised });
  return error ? failure(error) : { status: "ok" };
}

export const domainInput = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^@?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/)
  .max(253);

export async function addDomain(locale: string, orgId: string, domain: string): Promise<PlatformWriteResult> {
  if (!z.uuid().safeParse(orgId).success) return { status: "failed", message: "failed" };
  const parsed = domainInput.safeParse(domain);
  if (!parsed.success) return { status: "failed", message: "invalid_domain" };
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("add_org_domain", { p_org: orgId, p_domain: parsed.data });
  if (error) return failure(error);
  // `add_org_domain()` answers the new row's id, or null when the domain was
  // already on the list (`on conflict do nothing`) — which the screen says,
  // rather than «saved».
  return { status: "ok", id: (data as string | null) ?? undefined };
}

/**
 * REQ-TEN-007: removing a domain prevents *new* provisioning only. Existing
 * members keep access, which the screen says out loud — an admin who expects
 * removal to deprovision has removed the wrong thing.
 */
export async function removeDomain(locale: string, orgId: string, domain: string): Promise<PlatformWriteResult> {
  if (!z.uuid().safeParse(orgId).success) return { status: "failed", message: "failed" };
  const parsed = domainInput.safeParse(domain);
  if (!parsed.success) return { status: "failed", message: "invalid_domain" };
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("remove_org_domain", { p_org: orgId, p_domain: parsed.data });
  return error ? failure(error) : { status: "ok" };
}

// ── SCR-084 · metrics, aggregate only ─────────────────────────────────────

export interface PlatformTotals {
  orgs: number;
  activeOrgs: number;
  suspendedOrgs: number;
  members: number;
  activeMembers: number;
  sessions: number;
  certificates: number;
  activeImpersonations: number;
}

export async function getPlatformTotals(locale: string): Promise<PlatformTotals | null> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("platform_metrics_totals");
  if (error || !data) return null;
  const r = data as Record<string, number | string>;
  return {
    orgs: count(r.orgs),
    activeOrgs: count(r.active_orgs),
    suspendedOrgs: count(r.suspended_orgs),
    members: count(r.members),
    activeMembers: count(r.active_members),
    sessions: count(r.sessions),
    certificates: count(r.certificates),
    activeImpersonations: count(r.active_impersonations),
  };
}

export interface JobHealthRow {
  task: string;
  pending: number;
  failed: number;
  oldestPendingSeconds: number;
}

/**
 * `11` §3.1's numbers, and the one that actually catches a stalled queue is
 * `oldestPendingSeconds` — a queue that has degraded to polling looks busy and
 * healthy on every other metric. Returns an empty list where graphile-worker's
 * schema is not installed (a local checkout before `npm run test:rls`), which
 * is a fact about the environment, not a failure.
 */
export async function getJobHealth(locale: string): Promise<JobHealthRow[]> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("platform_job_health");
  if (error || !data) return [];
  return (data as { task_identifier: string; pending: number | string; failed: number | string; oldest_pending_seconds: number | string }[]).map(
    (r) => ({
      task: r.task_identifier,
      pending: count(r.pending),
      failed: count(r.failed),
      oldestPendingSeconds: count(r.oldest_pending_seconds),
    }),
  );
}

// ── SCR-084 and the console's home · the eight alerts of `11` §3.2 ─────────

/** `11` §3.2's alerts, in the document's order — the order both screens list them in. */
export const PLATFORM_ALERTS = [
  "queue_stalled",
  "ledger_divergence",
  "parity_failure",
  "calendar_backlog",
  "email_bounce_spike",
  "render_failures",
  "storage_prefix_violation",
  "impersonation_active",
] as const;
export type PlatformAlertKey = (typeof PLATFORM_ALERTS)[number];

export interface PlatformAlert {
  alert: PlatformAlertKey;
  fired: boolean;
  /**
   * Counts, ages, rates and thresholds only — `0075` writes nothing else, and
   * `tests/rls/platform-alerts.test.ts` pins the key set (REQ-ADM-003).
   */
  detail: Record<string, number | string>;
}

/**
 * The worker's own readings, through `platform_alerts()` — the thresholds live
 * once, in `evaluate_alerts()`, and are never re-derived here.
 *
 * ★ `null` when the read FAILED, never `[]`: a console that answered «nothing
 * needs attention» because the function was missing would be the one lie this
 * screen must not tell.
 */
export async function listPlatformAlerts(locale: string): Promise<PlatformAlert[] | null> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("platform_alerts");
  if (error || !data) return null;
  const rows = data as { alert: string; fired: boolean; detail: Record<string, number | string> | null }[];
  return PLATFORM_ALERTS.flatMap((key) => {
    const row = rows.find((r) => r.alert === key);
    return row ? [{ alert: key, fired: row.fired, detail: row.detail ?? {} }] : [];
  });
}

// ── SCR-085 · break-glass ─────────────────────────────────────────────────

export interface ImpersonationSession {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  /**
   * Decided here, not in the screen: reading the clock during render is an
   * impure call, and the answer belongs beside the row it describes anyway.
   * An expired session that the job has not swept yet is already inactive by
   * this reading, which matches what `my_impersonation()` and the hook do.
   */
  isActive: boolean;
  /**
   * How it ended — SCR-085's «expired» state (wave 8). `expire_impersonation_sessions()`
   * writes `ended_at = expires_at`, and `end_impersonation()` writes
   * `least(now(), expires_at)`, so a stop is an `ended_at` BEFORE the expiry and
   * anything at or past it ended on its own — including a session the job has
   * not swept yet. `null` while it is live.
   */
  endedBy: "stopped" | "expired" | null;
  /** Ended, either way, within the last hour — the page says so at the top. */
  endedRecently: boolean;
}

const RECENT_MS = 60 * 60 * 1000;

function endOf(endedAt: string | null, expiresAt: string, now: number): Pick<ImpersonationSession, "isActive" | "endedBy" | "endedRecently"> {
  const expires = Date.parse(expiresAt);
  if (endedAt === null && expires > now) return { isActive: true, endedBy: null, endedRecently: false };
  const ended = endedAt === null ? expires : Date.parse(endedAt);
  return { isActive: false, endedBy: ended < expires ? "stopped" : "expired", endedRecently: now - ended <= RECENT_MS };
}

export const startImpersonationInput = z.object({
  orgId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
  minutes: z.number().int().min(5).max(240),
});
export type StartImpersonationInput = z.infer<typeof startImpersonationInput>;

export async function startImpersonation(locale: string, input: StartImpersonationInput): Promise<PlatformWriteResult> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("start_impersonation", {
    p_org: input.orgId,
    p_reason: input.reason,
    p_minutes: input.minutes,
  });
  if (error) return failure(error);
  return { status: "ok", id: (data as { id?: string } | null)?.id };
}

export async function endImpersonation(locale: string, sessionId?: string): Promise<PlatformWriteResult> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("end_impersonation", { p_session: sessionId ?? null });
  return error ? failure(error) : { status: "ok" };
}

export async function listMyImpersonations(locale: string, limit = 20): Promise<ImpersonationSession[]> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("platform_impersonations", { p_limit: limit });
  if (error || !data) return [];
  const now = Date.now();
  return (data as { id: string; org_id: string; org_name: string; org_slug: string; reason: string; started_at: string; expires_at: string; ended_at: string | null }[]).map(
    (r) => ({
      id: r.id,
      orgId: r.org_id,
      orgName: r.org_name,
      orgSlug: r.org_slug,
      reason: r.reason,
      startedAt: r.started_at,
      expiresAt: r.expires_at,
      endedAt: r.ended_at,
      ...endOf(r.ended_at, r.expires_at, now),
    }),
  );
}

/**
 * The banner's read. Deliberately **not** gated by `requirePlatformAdmin()`:
 * it runs on every screen of the app shell for every visitor, and a redirect
 * or a `notFound()` from a banner would take the page with it. `my_impersonation()`
 * returns null for anyone who is not inside a live session of their own, which
 * is everyone almost always.
 */
export interface ActiveImpersonation {
  id: string;
  orgId: string;
  orgName: string;
  expiresAt: string;
  /** Decided here: reading the clock during render is an impure call. */
  minutesRemaining: number;
}

export async function getMyActiveImpersonation(): Promise<ActiveImpersonation | null> {
  const state = await getSessionState();
  if (state.kind === "none") return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("my_impersonation");
  if (error || !data) return null;
  const r = data as { id: string | null; org_id: string; expires_at: string };
  if (!r.id) return null;

  // The org's NAME is read the way any member of it would read it: during an
  // active session the token carries `org_id`, so `orgs_read_own` matches and
  // the column grant allows `name`. No definer function is needed, and the
  // banner therefore shows exactly what the session can actually see.
  const { data: org } = await supabase.from("orgs").select("name").eq("id", r.org_id).maybeSingle();
  const remaining = Math.max(0, Math.round((Date.parse(r.expires_at) - Date.now()) / 60000));
  return {
    id: r.id,
    orgId: r.org_id,
    orgName: (org?.name as string) ?? "",
    expiresAt: r.expires_at,
    minutesRemaining: remaining,
  };
}

// ── The platform-side trail ───────────────────────────────────────────────

export interface PlatformAuditRow {
  id: string;
  action: string;
  subjectOrg: string | null;
  reason: string | null;
  occurredAt: string;
  after: Record<string, unknown> | null;
}

export async function listPlatformAudit(locale: string, orgId?: string, limit = 50): Promise<PlatformAuditRow[]> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("platform_audit", { p_limit: limit, p_org: orgId ?? null });
  if (error || !data) return [];
  return (data as { id: string; action: string; subject_org: string | null; reason: string | null; occurred_at: string; after: Record<string, unknown> | null }[]).map(
    (r) => ({ id: r.id, action: r.action, subjectOrg: r.subject_org, reason: r.reason, occurredAt: r.occurred_at, after: r.after }),
  );
}
