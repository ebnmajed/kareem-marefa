// Wave 16 — the team colour chosen when a company is created (DEC-195 §3,
// REQ-UIX-043, STORY-UIX-032). No migration: the insert has carried every
// column the policy allows since 0004, and `team_color` since 0160. What is
// proven: an admin's insert carries it, the database's check still refuses a
// non-`#rrggbb` value on insert, a member still cannot insert at all, and —
// measured, written down — an insert writes no audit row, because 0161 fires
// on update and creating a company has never been audited (DEC-186 §8).
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-companies.team_color on insert", () => {
  it("an admin's insert carries the colour, or none", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`insert into public.companies (org_id, name, team_color) values ($1, 'بيت الألوان', '#35d0ff') returning team_color`, [f.a.id])).toEqual([{ team_color: "#35d0ff" }]);
      expect(await tx.q(`insert into public.companies (org_id, name, team_color) values ($1, 'بيت بلا لون', null) returning team_color`, [f.a.id])).toEqual([{ team_color: null }]);
    });
  });

  it("★ the check refuses upper case and anything but #rrggbb on insert too", async () => {
    for (const bad of ["#35D0FF", "red", "#fff"]) {
      await withTx(async (tx) => {
        const f = await seed(tx);
        await tx.as(f.a.admin.claims);
        expect(await errorCode(() => tx.q(`insert into public.companies (org_id, name, team_color) values ($1, 'x', $2)`, [f.a.id, bad]))).toBe("23514");
      });
    }
  });

  it("a member cannot insert a company, with a colour or without", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`insert into public.companies (org_id, name, team_color) values ($1, 'x', '#35d0ff')`, [f.a.id]))).toBe("42501");
    });
  });

  // ★ wave 22 (0181, DEC-232 §2.2): the gap this case measured is closed — creation is `company.created`, carrying the
  // colour in `after`; 0161 still writes nothing on insert.
  it("an insert with a colour writes company.created carrying the colour, and no team_color_changed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [c] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name, team_color) values ($1, 'بيت الألوان', '#ffd23f') returning id`, [f.a.id]);
      await tx.asOwner();
      const rows = await tx.q(`select action, after from public.audit_log where org_id = $1 and subject_id = $2`, [f.a.id, c.id]);
      expect(rows).toEqual([{ action: "company.created", after: { name: "بيت الألوان", team_color: "#ffd23f" } }]);
    });
  });
});
