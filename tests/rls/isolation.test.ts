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

// 02 §7 — exactly four, each named. `design_templates` is nullable for
// platform-scope rows and still carries the column.
const NO_ORG_ID = new Set(["orgs", "platform_admins", "registrations"]);
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
        if (!["org_domains", "audit_log", "scoring_config_history"].includes(table)) {
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
