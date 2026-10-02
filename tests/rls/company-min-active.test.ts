// 0175 (DEC-220 §1, REQ-UIX-082): the org's minimum of active members for the company ranking — its default, its
// range, who may change it, and the snapshot's frozen copy that no client can write.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("org_settings.company_min_active_members (0175)", () => {
  it("defaults to 3, and every member reads it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select company_min_active_members from public.org_settings`)).toEqual([{ company_min_active_members: 3 }]);
    });
  });

  it("an org admin may set it within 1–50; a value outside is refused with 23514", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.org_settings set company_min_active_members = 5 where org_id = $1`, [f.a.id]);
      expect(await tx.q(`select company_min_active_members from public.org_settings`)).toEqual([{ company_min_active_members: 5 }]);
      expect(await errorCode(() => tx.q(`update public.org_settings set company_min_active_members = 0 where org_id = $1`, [f.a.id]))).toBe("23514");
      expect(await errorCode(() => tx.q(`update public.org_settings set company_min_active_members = 51 where org_id = $1`, [f.a.id]))).toBe("23514");
    });
  });

  it("a member changes nothing, and nobody reaches another org's row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      await tx.q(`update public.org_settings set company_min_active_members = 9 where org_id = $1`, [f.a.id]);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.org_settings set company_min_active_members = 9 where org_id = $1`, [f.b.id]);
      await tx.asOwner();
      expect(await tx.q(`select org_id, company_min_active_members from public.org_settings where org_id in ($1, $2) order by org_id = $1 desc`, [f.a.id, f.b.id])).toEqual([
        { org_id: f.a.id, company_min_active_members: 3 },
        { org_id: f.b.id, company_min_active_members: 3 },
      ]);
    });
  });
});

describe("leaderboard_snapshots.min_active_members (0175)", () => {
  it("no client writes it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`update public.leaderboard_snapshots set min_active_members = 2 where org_id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });
});
