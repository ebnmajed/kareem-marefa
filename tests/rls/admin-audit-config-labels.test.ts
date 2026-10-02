// SCR-062 reads `scoring_config_history` beside `audit_log` (`REQ-UIX-099`, `DEC-231` §4.3), and every one of its rows is
// ONE CHANGED COLUMN of one of eight tables — each history trigger writes every column but its bookkeeping ones (0004,
// 0027, 0068, 0081, 0123). So every such column needs words in `admin.audit.config.fields`, or the screen would show
// an admin a column's machine name. This reads the columns from the database itself, so a column added later fails
// here until it has its label — the shape `admin-audit-labels.test.ts` gives the actions.
import { afterAll, describe, expect, it } from "vitest";
import ar from "@/messages/ar/admin.json";
import en from "@/messages/en/admin.json";
import { pool } from "./db";

afterAll(() => pool.end());

/** scope → table, and the columns its trigger skips. */
const TRACKED: Record<string, { table: string; skip: string[] }> = {
  org_settings: { table: "org_settings", skip: ["id", "org_id", "created_at", "updated_at"] },
  scoring: { table: "scoring_rules", skip: ["id", "org_id", "action_key", "actor", "created_at", "updated_at"] },
  branding: { table: "brand_kits", skip: ["id", "org_id", "updated_at", "updated_by"] },
  company_scoring: { table: "company_scoring_rules", skip: ["id", "org_id", "action_key", "created_at", "updated_at"] },
  badges: { table: "badges", skip: ["id", "org_id", "created_at", "updated_at"] },
  levels: { table: "levels", skip: ["id", "org_id", "created_at", "updated_at"] },
  perks: { table: "perks", skip: ["id", "org_id", "created_at", "updated_at"] },
  streaks: { table: "streak_rules", skip: ["id", "org_id", "created_at", "updated_at"] },
};

describe("REQ-UIX-099 — every configuration column the history can name reads in words", () => {
  it("each scope has a label, in Arabic and in English", () => {
    for (const scope of Object.keys(TRACKED)) {
      expect(ar.admin.audit.config.scopes[scope as keyof typeof ar.admin.audit.config.scopes], scope).toBeTruthy();
      expect(en.admin.audit.config.scopes[scope as keyof typeof en.admin.audit.config.scopes], scope).toBeTruthy();
    }
  });

  it("each tracked column has a label, in Arabic and in English — and 0123's «created» row too", async () => {
    const missing: string[] = [];
    const fields = ar.admin.audit.config.fields as Record<string, string>;
    const fieldsEn = en.admin.audit.config.fields as Record<string, string>;
    for (const [scope, { table, skip }] of Object.entries(TRACKED)) {
      const { rows } = await pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
        [table],
      );
      expect(rows.length, table).toBeGreaterThan(0);
      for (const { column_name } of rows) {
        if (skip.includes(column_name)) continue;
        if (!fields[column_name] || !fieldsEn[column_name]) missing.push(`${scope}.${column_name}`);
      }
    }
    if (!fields.created || !fieldsEn.created) missing.push("created");
    expect(missing).toEqual([]);
  });
});
