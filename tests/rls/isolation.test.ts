// The isolation sweep — one test, every table. 03 §8.1, 13 §3.2, REQ-TEN-003,
// REQ-NFR-001.
//
// Generated over the tables that EXIST in the database, not over a list
// someone maintains: a table created tomorrow is covered tomorrow, and a
// table someone forgot to protect fails immediately. For each table:
//   · RLS is enabled;
//   · it carries org_id, unless 02 §7 names it as one of the four exceptions;
//   · a member of org A, selecting with NO org predicate, gets zero rows of
//     org B — or is refused outright, which is isolation too.
//
// This is the executable form of D3 and the only thing standing between a
// browser client and another org's data (DEC-020, DEC-021). Never weaken it.

import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";

// 02 §7 — exactly five, each named. `design_templates` is nullable for
// platform-scope rows and still carries the column; `fonts` is the fifth
// exception (DEC-049): content-addressed and platform-wide by design.
// `retention_periods` and `platform_audit_log` are platform-level like `platform_admins` (0069, DEC-054):
// no org_id, no policy, no grant — the sweep proves them by refusal.
const NO_ORG_ID = new Set(["orgs", "platform_admins", "registrations", "fonts", "retention_periods", "platform_audit_log"]);
// Frozen legacy: outside the policy model by decision (DEC-002).
const EXEMPT = new Set(["registrations"]);

let tables: string[] = [];

beforeAll(async () => {
  const { rows } = await pool.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' order by 1`,
  );
  tables = rows.map((r) => r.tablename);
  expect(tables.length).toBeGreaterThan(0);
});
afterAll(() => pool.end());

describe("every public table", () => {
  it("has RLS enabled", async () => {
    const { rows } = await pool.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("carries org_id, or is one of the four documented exceptions", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'org_id'`,
    );
    const withOrg = new Set(rows.map((r) => r.table_name));
    const missing = tables.filter((t) => !withOrg.has(t) && !NO_ORG_ID.has(t));
    expect(missing).toEqual([]);
  });
});

describe("a member of org A selecting with no org predicate", () => {
  it("is defined for every table the database has", () => {
    expect(tables.filter((t) => !EXEMPT.has(t)).length).toBeGreaterThan(0);
  });

  // The cases are generated at collection time from a snapshot query so
  // Vitest can name one test per table; the beforeAll above re-asserts the
  // list is non-empty at run time.
  for (const table of snapshotTables()) {
    if (EXEMPT.has(table)) continue;
    it(`${table}: sees zero rows of org B`, async () => {
      await withTx(async (tx) => {
        const f = await seed(tx);
        await tx.as(f.a.members[0].claims);
        let rows: { org_id?: string }[] = [];
        let refused = false;
        try {
          rows = NO_ORG_ID.has(table)
            ? await tx.q(`select * from public.${table}`)
            : await tx.q(`select org_id from public.${table}`);
        } catch (e) {
          // No select grant at all (platform_admins) is isolation by refusal.
          expect((e as { code?: string }).code).toBe("42501");
          refused = true;
        }
        if (refused) return;
        if (table === "orgs") {
          const ids = (rows as { id: string }[]).map((r) => r.id);
          expect(ids).toContain(f.a.id);
          expect(ids).not.toContain(f.b.id);
          return;
        }
        expect(rows.some((r) => r.org_id === f.b.id)).toBe(false);
        // And the sweep is not vacuous: org A's own rows are visible where the
        // role may read the table at all.
        // Where a plain member may see none of A's rows by design: admin-only
        // lists, the audit log, the host-view code, the check-in attempts,
        // the staff/presenter-only transitions, the self-scoped ratings
        // and reports (the fixture's are another member's), and M3's two
        // admin-only tables (templates, the delivery log — 0026), and a
        // session's certificate design, which staff alone read (0099,
        // tests/rls/certificates-designs.test.ts), and the survey's six
        // authoring tables, which staff alone read (0124, REQ-SUR-005 — a plain
        // member reads a survey through one function, never a table). The
        // survey's register and box are not here: with no grant at all they are
        // refused above, which is isolation too (DEC-160 §3.3). Their own
        // per-policy tests prove the scoping; the sweep proves the wall.
        if (!["org_domains", "audit_log", "scoring_config_history", "check_in_codes", "check_in_attempts", "session_state_transitions", "ratings", "reports", "notification_templates", "email_deliveries", "fonts", "impersonation_sessions", "session_certificate_designs", "survey_templates", "survey_template_questions", "survey_template_options", "surveys", "survey_questions", "survey_question_options"].includes(table)) {
          expect(rows.some((r) => r.org_id === f.a.id)).toBe(true);
        }
      });
    });
  }
});

function snapshotTables(): string[] {
  // Vitest collects tests synchronously, so the list is read once, here,
  // through a blocking query on a throwaway connection.
  const out = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import pg from 'pg'; const c = new pg.Client(process.env.RLS_DATABASE_URL); await c.connect();
       const r = await c.query("select tablename from pg_tables where schemaname = 'public' order by 1");
       console.log(JSON.stringify(r.rows.map(x => x.tablename))); await c.end();`,
    ],
    { encoding: "utf8", env: process.env },
  );
  return JSON.parse(out.trim().split("\n").pop()!) as string[];
}
