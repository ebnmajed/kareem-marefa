// Wave 16 — scoring's two writers of `member_seen_marks` (0162, the lead's table;
// DEC-195 §2.6, DEC-197 §6, REQ-UIX-047, REQ-UIX-048).
//
// `mark_points_seen()` and `mark_board_seen()` are `security invoker`, so the
// table's own-row policies are the boundary. What is proven here is what the
// functions add on top: the caller's own row, created the first time; each
// writes only its own columns; a foreign level or company is refused BEFORE the
// write; an unknown board is refused; a fraction is clamped; anon cannot call.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "scoring/0001_seen_marks_functions.sql";

async function setup(tx: Tx) {
  await applyProposed(tx, FILE);
  return seed(tx);
}

describe("RPC-mark_points_seen", () => {
  it("writes the caller's own mark, inserting it the first time", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[1]; // no mark yet (the fixture marks members[0])
      await tx.asOwner();
      const [lvl] = await tx.q<{ id: string }>(`select id from public.levels where org_id = $1 order by sort_order limit 1`, [f.a.id]);
      await tx.as(me.claims);
      await tx.q(`select public.mark_points_seen(gen_random_uuid(), 25, $1)`, [lvl.id]);
      expect(await tx.q(`select points_total, level_id from public.member_seen_marks`)).toEqual([{ points_total: 25, level_id: lvl.id }]);
      await tx.q(`select public.mark_points_seen(null, 40, null)`);
      expect(await tx.q(`select points_entry_id, points_total, level_id from public.member_seen_marks`)).toEqual([
        { points_entry_id: null, points_total: 40, level_id: null },
      ]);
    });
  });

  it("never touches another member's mark", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [before] = await tx.q(`select * from public.member_seen_marks where member_id = $1`, [f.a.members[0].memberId]);
      await tx.as(f.a.members[1].claims);
      await tx.q(`select public.mark_points_seen(null, 999, null)`);
      await tx.asOwner();
      const [after] = await tx.q(`select * from public.member_seen_marks where member_id = $1`, [f.a.members[0].memberId]);
      expect(after).toEqual(before);
    });
  });

  it("★ a level of another org is refused with 22023, and nothing is written", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [foreign] = await tx.q<{ id: string }>(`select id from public.levels where org_id = $1 limit 1`, [f.b.id]);
      const me = f.a.members[1];
      await tx.as(me.claims);
      // The other org's level is not even readable to the caller, and the refusal says so the same way.
      expect(await errorCode(() => tx.q(`select public.mark_points_seen(null, 1, $1)`, [foreign.id]))).toBe("22023");
      expect(await tx.q(`select 1 from public.member_seen_marks`)).toEqual([]);
    });
  });
});

describe("RPC-mark_board_seen", () => {
  it("★ touches only the named board's columns", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[1];
      await tx.as(me.claims);
      await tx.q(`select public.mark_points_seen(null, 70, null)`);
      await tx.q(`select public.mark_board_seen('all_time', null, 4, null, null)`);
      await tx.q(`select public.mark_board_seen('monthly', '2026-09-01', 2, null, null)`);
      await tx.q(`select public.mark_board_seen('company', '2026-09-01', 3, $1, 0.5)`, [f.a.companyId]);
      await tx.q(`select public.mark_board_seen('all_time', null, 3, null, null)`);
      const [row] = await tx.q(
        `select points_total, all_time_rank, monthly_period::text, monthly_rank, company_period::text, company_id, company_rank, company_fraction::float8 as company_fraction
           from public.member_seen_marks`,
      );
      expect(row).toEqual({
        points_total: 70,
        all_time_rank: 3,
        monthly_period: "2026-09-01",
        monthly_rank: 2,
        company_period: "2026-09-01",
        company_id: f.a.companyId,
        company_rank: 3,
        company_fraction: 0.5,
      });
    });
  });

  it("an unknown board is refused with 22023", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[1].claims);
      for (const board of ["weekly", "", null]) {
        expect(await errorCode(() => tx.q(`select public.mark_board_seen($1, null, 1, null, null)`, [board]))).toBe("22023");
      }
    });
  });

  it("a company of another org is refused with 22023", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select public.mark_board_seen('company', null, 1, $1, 0.2)`, [f.b.companyId]))).toBe("22023");
      expect(await tx.q(`select 1 from public.member_seen_marks`)).toEqual([]);
    });
  });

  it("a fraction outside 0–1 is stored clamped, and a rank that is not positive as none", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[1].claims);
      await tx.q(`select public.mark_board_seen('company', null, 0, $1, 1.7)`, [f.a.companyId]);
      expect(await tx.q(`select company_rank, company_fraction::float8 as f from public.member_seen_marks`)).toEqual([{ company_rank: null, f: 1 }]);
      await tx.q(`select public.mark_board_seen('company', null, 2, $1, -3)`, [f.a.companyId]);
      expect(await tx.q(`select company_rank, company_fraction::float8 as f from public.member_seen_marks`)).toEqual([{ company_rank: 2, f: 0 }]);
    });
  });
});

describe("RPC-mark_seen — who may call", () => {
  it("anon can execute neither", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.mark_points_seen(null, 1, null)`))).toBe("42501");
      expect(await errorCode(() => tx.q(`select public.mark_board_seen('all_time', null, 1, null, null)`))).toBe("42501");
    });
  });
});
