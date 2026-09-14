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

export const auditFiltersInput = z.object({
  actorId: z.uuid().optional(),
  action: z.string().trim().max(80).optional(),
  subjectType: z.string().trim().max(40).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});
export type AuditFilters = z.infer<typeof auditFiltersInput>;

async function requireStaff(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" || client.session.role === "moderator" ? client : null;
}

/** Every distinct action string that has ever been logged, org-scoped by
 *  the same RLS the main query uses — populates the filter's `<select>`
 *  without hardcoding a list this track would have to keep in step with
 *  every other track's own `write_audit()` call sites. */
export async function listAuditActions(locale: string): Promise<string[] | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const { supabase } = client;
  const { data, error } = await supabase.from("audit_log").select("action").limit(2000);
  if (error) throw new Error(`audit_log: ${error.message}`);
  return Array.from(new Set((data ?? []).map((r) => r.action as string))).sort();
}

export async function listAuditLog(locale: string, filters: AuditFilters): Promise<AuditLogRow[] | null> {
  const client = await requireStaff(locale);
  if (!client) return null;
  const parsed = auditFiltersInput.parse(filters);
  const { supabase } = client;

  let query = supabase.from("audit_log").select("id, actor_id, actor_role, action, subject_type, subject_id, reason, occurred_at").order("occurred_at", { ascending: false }).limit(200);
  if (parsed.actorId) query = query.eq("actor_id", parsed.actorId);
  if (parsed.action) query = query.eq("action", parsed.action);
  if (parsed.subjectType) query = query.eq("subject_type", parsed.subjectType);
  if (parsed.dateFrom) query = query.gte("occurred_at", parsed.dateFrom);
  if (parsed.dateTo) query = query.lte("occurred_at", parsed.dateTo);

  const { data, error } = await query;
  if (error) throw new Error(`audit_log: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id as string | null).filter((id): id is string => id !== null)));
  const names = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: members, error: mErr } = await supabase.from("members").select("id, display_name").in("id", actorIds);
    if (mErr) throw new Error(`members: ${mErr.message}`);
    for (const m of members ?? []) names.set(m.id as string, m.display_name as string | null);
  }

  return rows.map((r) => ({
    id: r.id as string,
    actorId: r.actor_id as string | null,
    actorName: r.actor_id ? (names.get(r.actor_id as string) ?? null) : null,
    actorRole: r.actor_role as string | null,
    action: r.action as string,
    subjectType: r.subject_type as string | null,
    subjectId: r.subject_id as string | null,
    reason: r.reason as string | null,
    occurredAt: r.occurred_at as string,
  }));
}

/** For the actor filter's own picker — every member who could plausibly
 *  be an actor (an admin or moderator, past or present; `actor_role` on
 *  the row itself is the historical truth, this is only for the dropdown
 *  label). Admin-only, matching the members list's own gate (the actor
 *  picker names members by their current role, which is admin-console
 *  information). A moderator does not need it — their own query is
 *  already scoped to themselves. */
export async function listStaffActors(locale: string): Promise<{ id: string; displayName: string | null }[] | null> {
  const client = await sessionClient(locale);
  if (client.session.role !== "admin") return null;
  const { session, supabase } = client;
  const { data, error } = await supabase.from("members").select("id, display_name, org_role").eq("org_id", session.orgId).in("org_role", ["admin", "moderator"]).order("display_name");
  if (error) throw new Error(`members: ${error.message}`);
  return (data ?? []).map((m) => ({ id: m.id as string, displayName: m.display_name as string | null }));
}
