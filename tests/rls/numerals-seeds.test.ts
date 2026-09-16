// REQ-INT-006, DEC-124, DEC-143 — no row the platform seeds carries an
// Arabic-Indic digit.
//
// DEC-124's catalogue test (tests/unit/messages-numerals.test.ts) reads the
// message files; it cannot see a string a migration writes into a row, and
// _seed_org_scoring() wrote «٣» and «٤.٥» into every org's catalogue until
// 0083. This reads what seeding ACTUALLY wrote: the fixture creates orgs
// through the real `orgs` insert (so every org-creation trigger runs), and
// every column of every public table is scanned for U+0660–U+0669 and
// U+06F0–U+06F9 — the fixture's own orgs' rows where a table has an `org_id`
// (so an e2e leftover in a long-lived local database cannot fail this), and
// every row where it has none (the platform's own seeds, the baseline library).
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const ARABIC_INDIC = "[\\u0660-\\u0669\\u06F0-\\u06F9]";

describe("seeded rows carry Western digits only (DEC-124)", () => {
  it("no public table holds an Arabic-Indic digit after orgs are created", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const orgIds = [f.a.id, f.b.id];
      const tables = await tx.q<{ table_name: string; has_org: boolean }>(
        `select t.table_name,
                exists (select 1 from information_schema.columns c
                         where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'org_id') as has_org
           from information_schema.tables t
          where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
          order by t.table_name`,
      );
      const offenders: string[] = [];
      for (const { table_name, has_org } of tables) {
        const [row] = await tx.q<{ n: string }>(
          `select count(*)::text as n from public.${JSON.stringify(table_name)} t
            where t::text ~ $1 ${has_org ? "and t.org_id = any($2::uuid[])" : "and $2::uuid[] is not null"}`,
          [ARABIC_INDIC, orgIds],
        );
        if (Number(row.n) > 0) offenders.push(`${table_name}: ${row.n} row(s)`);
      }
      expect(offenders, "Arabic-Indic digits in seeded rows — numerals are Western everywhere (DEC-124)").toEqual([]);
    });
  });
});
