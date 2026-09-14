// SCR-049 — `admin_list_members()` (REQ-ADM-009's "view a member's full
// record," which 0004/0005 never built a path for — see the proposed
// file's own header). Applied with applyProposed() inside this test's
// rolled-back transaction (DEC-040).
//
// `set_member_role`/`deactivate_member`/`reactivate_member` (the rest of
// REQ-ADM-009 and REQ-TEN-005) already exist and are already proven in
// `tests/rls/rpcs.test.ts` (POL-set_member_role, POL-deactivate_member) —
// nothing here duplicates those cases.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["console/0001_admin_members.sql"];

/** A file the lead has promoted is applied by `supabase db reset` and no
 *  longer exists under `supabase/proposed/` (notify's pattern, wave 2). */
async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

describe("POL-admin_list_members", () => {
  it("an admin sees every one of org A's members with email, and none of org B's", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ id: string; email: string }>(`select id, email from public.admin_list_members()`);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(f.a.admin.memberId);
      expect(ids).toContain(f.a.members[0].memberId);
      expect(ids).toContain(f.a.members[1].memberId);
      expect(ids).not.toContain(f.b.admin.memberId);
      // Not visible AT ALL through the base table's own column grant.
      expect(rows.every((r) => typeof r.email === "string" && r.email.length > 0)).toBe(true);
    });
  });

  it("a member and a moderator both get zero rows, not an error", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.admin_list_members()`)).toEqual([]);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select id from public.admin_list_members()`)).toEqual([]);
    });
  });

  it("the base table's own column grant still hides email from a direct select, admin included — this function is the only door", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const err = await tx.q(`select email from public.members where id = $1`, [f.a.members[0].memberId]).catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/permission denied/i);
    });
  });
});
