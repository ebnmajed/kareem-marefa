// SCR-062's words for a row, shared by the screen and its CSV (`REQ-UIX-099`, wave 22) — so the file says what the
// screen says. Pure: it takes the `admin.audit` messages object, never a translator, so the CSV (server, always Arabic)
// and the page (any locale) read one implementation.
//
// ★ Every action, scope and field reads in words; a key with no label falls back to the key itself, and
// `admin-audit-labels.test.ts` (actions) and `tests/rls/admin-audit-config-labels.test.ts` (fields) fail on one.

export interface AuditMessages {
  actions: Record<string, Record<string, string>>;
  subjects: Record<string, string>;
  config: { scopes: Record<string, string>; fields: Record<string, string>; yes: string; no: string; none: string; composite: string };
}

export function actionText(m: AuditMessages, action: string): string {
  const [domain, verb] = action.split(".");
  return m.actions[domain]?.[verb] ?? action;
}

export function subjectText(m: AuditMessages, type: string): string {
  return m.subjects[type] ?? type;
}

export function scopeText(m: AuditMessages, scope: string): string {
  return m.config.scopes[scope] ?? scope;
}

export function fieldText(m: AuditMessages, field: string): string {
  return m.config.fields[field] ?? field;
}

/** A history value as words: a boolean «نعم»/«لا», null «—», a number with Western digits, a list joined. */
export function valueText(m: AuditMessages, value: unknown): string {
  if (value === null || value === undefined) return m.config.none;
  if (typeof value === "boolean") return value ? m.config.yes : m.config.no;
  if (typeof value === "number") return new Intl.NumberFormat("en-US").format(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v !== "object" || v === null)) return value.map((v) => valueText(m, v)).join("، ");
  return m.config.composite;
}
