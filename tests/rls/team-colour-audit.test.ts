// console · wave 15 — `companies_team_color_audit()` (DEC-183 §4.11,
// DEC-186 §8, REQ-UIX-043). Applied with applyProposed() inside this test's
// rolled-back transaction (DEC-040). Tested as an ORG ADMIN performing an
// ordinary `update` through RLS's own p2_admin_update policy — never as the
// trigger's owner — because the trigger fires on every write path a member
// can actually reach, not just an RPC.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, "console/team_colour_audit.sql");
  return f;
}

describe("POL-companies.team_color_audit", () => {
  it("an admin's colour change is audited, naming the company, the old colour and the new one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ team_color: string | null }>(
        `update public.companies set team_color = '#c6ff3d' where id = $1 returning team_color`,
        [f.a.companyId],
      );
      expect(row.team_color).toBe("#c6ff3d");
      const audit = await tx.q<{ actor_id: string; actor_role: string; subject_type: string; subject_id: string; before: { teamColor: string | null }; after: { teamColor: string } }>(
        `select actor_id, actor_role, subject_type, subject_id, before, after from public.audit_log
          where org_id = $1 and action = 'company.team_color_changed' and subject_id = $2`,
        [f.a.id, f.a.companyId],
      );
      expect(audit).toEqual([
        {
          actor_id: f.a.admin.memberId,
          actor_role: "admin",
          subject_type: "company",
          subject_id: f.a.companyId,
          before: { teamColor: null },
          after: { teamColor: "#c6ff3d" },
        },
      ]);
    });
  });

  it("clearing the colour is audited too — the old value against null", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.companies set team_color = '#35d0ff' where id = $1`, [f.a.companyId]);
      await tx.q(`update public.companies set team_color = null where id = $1`, [f.a.companyId]);
      // Both writes land in the SAME transaction, and `now()` returns the
      // transaction's start for both rows — ordering by a timestamp would
      // not distinguish them (the standing trap: "never order by created_at
      // to find the last row"). Sorted in JS by a value that differs
      // instead, so the assertion is order-independent of the database.
      const audit = await tx.q<{ before: { teamColor: string | null }; after: { teamColor: string | null } }>(
        `select before, after from public.audit_log
          where org_id = $1 and action = 'company.team_color_changed' and subject_id = $2`,
        [f.a.id, f.a.companyId],
      );
      audit.sort((a, b) => (a.after.teamColor ?? "").localeCompare(b.after.teamColor ?? ""));
      expect(audit).toEqual([
        { before: { teamColor: "#35d0ff" }, after: { teamColor: null } },
        { before: { teamColor: null }, after: { teamColor: "#35d0ff" } },
      ]);
    });
  });

  it("a write that leaves the colour untouched — renaming the company — writes no audit row", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.companies set name = 'شركة أخرى' where id = $1`, [f.a.companyId]);
      const audit = await tx.q(
        `select 1 from public.audit_log where org_id = $1 and action = 'company.team_color_changed' and subject_id = $2`,
        [f.a.id, f.a.companyId],
      );
      expect(audit).toEqual([]);
    });
  });

  it("a member cannot write the colour at all — p2_admin_update's USING filters the row before the trigger ever sees it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      // p2_admin_update's `using` excludes the row for a non-admin, so the
      // update matches nothing — no error, no row, and so no audit row
      // either (the trigger fires on the row Postgres never touches).
      const rows = await tx.q(`update public.companies set team_color = '#ffd23f' where id = $1 returning id`, [f.a.companyId]);
      expect(rows).toEqual([]);
      await tx.as(f.a.admin.claims);
      const audit = await tx.q(
        `select 1 from public.audit_log where org_id = $1 and action = 'company.team_color_changed' and subject_id = $2`,
        [f.a.id, f.a.companyId],
      );
      expect(audit).toEqual([]);
    });
  });

  it("a company that never had a colour, deactivated, writes no audit row from this trigger", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.companies set deactivated_at = now() where id = $1`, [f.a.companyId]);
      const audit = await tx.q(
        `select 1 from public.audit_log where org_id = $1 and action = 'company.team_color_changed' and subject_id = $2`,
        [f.a.id, f.a.companyId],
      );
      expect(audit).toEqual([]);
    });
  });
});
