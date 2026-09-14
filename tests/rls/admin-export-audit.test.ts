// SCR-044/SCR-061 — `write_admin_export_audit()` (REQ-ADM-017's "every
// export is audited"). Applied with applyProposed() inside this test's
// rolled-back transaction (DEC-040).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorMessage, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["console/0002_admin_export_audit.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

describe("POL-write_admin_export_audit", () => {
  it("an admin's export writes exactly one audited row naming the export type and the subject", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `select public.write_admin_export_audit('attendance', 'session', $1) as id`,
        [f.m2.a.published],
      );
      expect(id).toBeTruthy();
      const rows = await tx.q<{ action: string; subject_type: string; subject_id: string; after: { export_type: string }; actor_id: string }>(
        `select action, subject_type, subject_id, after, actor_id from public.audit_log where id = $1`,
        [id],
      );
      expect(rows).toEqual([
        { action: "export.created", subject_type: "session", subject_id: f.m2.a.published, after: { export_type: "attendance" }, actor_id: f.a.admin.memberId },
      ]);
    });
  });

  it("a moderator and a member are both refused — the boundary is assert_fresh_admin(), not the route handler", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => tx.q(`select public.write_admin_export_audit('attendance')`))).toMatch(/not_an_admin/);
      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => tx.q(`select public.write_admin_export_audit('attendance')`))).toMatch(/not_an_admin/);
    });
  });

  it("an admin cannot forge another org's export as their own subject — the audit row still lands in the caller's own org", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(`select public.write_admin_export_audit('attendance', 'session', $1) as id`, [f.m2.b.published]);
      const rows = await tx.q<{ org_id: string }>(`select org_id from public.audit_log where id = $1`, [id]);
      expect(rows[0].org_id).toBe(f.a.id);
      // Org B's admin cannot see it (§5.10a: admin sees own org's log only).
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select 1 from public.audit_log where id = $1`, [id])).toEqual([]);
    });
  });
});
