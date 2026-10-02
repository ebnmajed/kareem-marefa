// Wave 22 — a venue names the company that owns it (REQ-ADM-022, DEC-230 §2, STORY-ADM-010). 0180.
//
// One nullable column on `venues`, written through the policies the table has had since 0004, and guarded by a
// same-org trigger in 0081's shape. What is proven: every venue starts with none; an admin sets and clears it; a
// member and a moderator cannot; another org's company is refused for every writer, the owner included.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-venues.company_id", () => {
  it("★ null: the migration wrote no company onto any venue", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const rows = await tx.q<{ n: number }>(`select count(*)::int as n from public.venues where org_id in ($1, $2) and company_id is not null`, [f.a.id, f.b.id]);
      expect(rows[0].n).toBe(0);
    });
  });

  it("admin: an admin sets it and clears it back to none, and a member of the org reads it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`update public.venues set company_id = $2 where id = $1 returning company_id`, [f.a.venueId, f.a.companyId])).toEqual([{ company_id: f.a.companyId }]);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select company_id from public.venues where id = $1`, [f.a.venueId])).toEqual([{ company_id: f.a.companyId }]);
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`update public.venues set company_id = null where id = $1 returning company_id`, [f.a.venueId])).toEqual([{ company_id: null }]);
    });
  });

  it("admin: a member cannot write it, and neither can a moderator", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const who of [f.a.members[0], f.a.mod]) {
        await tx.as(who.claims);
        expect(await tx.q(`update public.venues set company_id = $2 where id = $1 returning id`, [f.a.venueId, f.a.companyId])).toEqual([]);
      }
      await tx.asOwner();
      expect(await tx.q(`select company_id from public.venues where id = $1`, [f.a.venueId])).toEqual([{ company_id: null }]);
    });
  });

  it("admin: an admin creates a venue that names its owner", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ company_id: string }>(
        `insert into public.venues (org_id, name, capacity, company_id) values ($1, 'قاعة الشركة', 20, $2) returning company_id`,
        [f.a.id, f.a.companyId],
      );
      expect(rows).toEqual([{ company_id: f.a.companyId }]);
    });
  });

  it("same_org: another org's company is refused with 23514 — for the org's admin and for the owner", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`update public.venues set company_id = $2 where id = $1`, [f.a.venueId, f.b.companyId]))).toBe("23514");
    });
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      expect(await errorCode(() => tx.q(`update public.venues set company_id = $2 where id = $1`, [f.a.venueId, f.b.companyId]))).toBe("23514");
    });
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      expect(
        await errorCode(() => tx.q(`insert into public.venues (org_id, name, capacity, company_id) values ($1, 'قاعة', 10, $2)`, [f.a.id, f.b.companyId])),
      ).toBe("23514");
    });
  });
});
