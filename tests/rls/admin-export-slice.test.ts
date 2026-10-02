// `export.created` records the slice that left (DEC-232 §2.8, REQ-ADM-017) — `supabase/proposed/console/export_slice.sql`,
// applied inside this test's rolled-back transaction (DEC-040). A new file beside `admin-export-audit.test.ts`, whose
// three cases are the evidence that a call without a slice still writes 0058's row.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorMessage, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, "console/export_slice.sql");
  return f;
}

describe("POL-write_admin_export_audit.slice", () => {
  it("an admin's export records its slice under after.slice", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(`select public.write_admin_export_audit('members', null, null, $1::jsonb) as id`, [
        JSON.stringify({ role: "moderator", company: null, q: "" }),
      ]);
      const rows = await tx.q<{ after: unknown }>(`select after from public.audit_log where id = $1`, [id]);
      expect(rows[0].after).toEqual({ export_type: "members", slice: { role: "moderator", company: null, q: "" } });
    });
  });

  it("★ a call with three named arguments — main's code — writes 0058's row exactly, no slice key", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `select public.write_admin_export_audit(p_export_type => 'attendance', p_subject_type => 'session', p_subject_id => $1) as id`,
        [f.m2.a.published],
      );
      const rows = await tx.q<{ after: unknown }>(`select after from public.audit_log where id = $1`, [id]);
      expect(rows[0].after).toEqual({ export_type: "attendance" });
    });
  });

  it("a slice that is not an object, or too large to be a description, is refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.write_admin_export_audit('members', null, null, '[1,2]'::jsonb)`))).toMatch(/export_slice_invalid/);
      expect(await errorMessage(() => tx.q(`select public.write_admin_export_audit('members', null, null, $1::jsonb)`, [JSON.stringify({ q: "x".repeat(17000) })]))).toMatch(
        /export_slice_invalid/,
      );
    });
  });

  it("a moderator is still refused — assert_fresh_admin() is the boundary", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => tx.q(`select public.write_admin_export_audit('members', null, null, '{}'::jsonb)`))).toMatch(/not_an_admin/);
    });
  });
});
