import type { AuditFilters, AuditPeriod } from "@/lib/dal/admin-audit";

// SCR-062's filters in the URL — the same parameter names as wave 8's (`actor`, `action`, `subject`, `subjectId`,
// `period`, `from`, `to`, `before`), so every link already sent still opens the log it named.

export const AUDIT_PATH = "/app/admin/audit";

/** `AUDIT_PERIODS` (`admin-audit.ts`, server-only) as the client may hold it; the type keeps the two the same set. */
export const AUDIT_PERIOD_CHOICES: readonly AuditPeriod[] = ["7d", "30d", "month", "custom"];

const PARAM: Record<keyof AuditFilters, string> = {
  actor: "actor",
  action: "action",
  subjectType: "subject",
  subjectId: "subjectId",
  period: "period",
  from: "from",
  to: "to",
  before: "before",
};

export function auditParams(filters: AuditFilters): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, param] of Object.entries(PARAM) as [keyof AuditFilters, string][]) {
    const value = filters[key];
    if (value) query.set(param, value);
  }
  return query;
}

export function auditHref(filters: AuditFilters): string {
  const qs = auditParams(filters).toString();
  return qs ? `${AUDIT_PATH}?${qs}` : AUDIT_PATH;
}

/** The filters with some removed — and always without the cursor: a new filter starts from the newest rows. */
export function auditWithout(filters: AuditFilters, ...keys: (keyof AuditFilters)[]): AuditFilters {
  const next: AuditFilters = { ...filters, before: undefined };
  for (const key of keys) next[key] = undefined;
  return next;
}
