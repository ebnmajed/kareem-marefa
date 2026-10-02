// Wave 20, PR C — «بلا ترتيب» (DEC-220 §1, DEC-222, REQ-UIX-082, STORY-UIX-072, REQ-LDR-006).
//
// supabase/proposed/scoring/w20c_0002_company_minimum.sql — `snapshot_leaderboard()`'s company branch freezes the
// org's `company_min_active_members` (0175) onto the snapshot and ranks the companies at or above it FIRST.
//
// 03 §8.2 rows proven here: RPC-snapshot_leaderboard.{min_frozen, eligible_first, final_untouched}.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "scoring/w20c_0002_company_minimum.sql";

/** Org a's one big company (admin, mod, members — at least four active) and a new small one holding one member. */
async function setup(tx: Tx) {
  await applyProposed(tx, FILE);
  const f = await seed(tx);
  await tx.asOwner();
  const [small] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'شركة صغيرة') returning id`, [f.a.id]);
  await tx.q(`update public.members set company_id = $1 where id = $2`, [small.id, f.a.members[0].memberId]);
  // The small company's one member out-earns the big company per member: 100 against 30 shared by the rest.
  await tx.q(
    `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values
       ($1, $2, 100, 'manual_adjustment', 'اختبار', 'test:min:small'),
       ($1, $3, 30,  'manual_adjustment', 'اختبار', 'test:min:big')`,
    [f.a.id, f.a.members[0].memberId, f.a.admin.memberId],
  );
  return { f, small: small.id, big: f.a.companyId };
}

/** This month's bounds — the ledger rows above are written now. */
const MONTH = `date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month')::date`;

async function snapshot(tx: Tx, orgId: string, final = false) {
  const [{ id }] = await tx.q<{ id: string }>(`select public.snapshot_leaderboard($1, 'company', ${MONTH}, null, $2) as id`, [orgId, final]);
  const ranks = await tx.q<{ company_id: string; rank: number }>(`select company_id, rank from public.leaderboard_entries where snapshot_id = $1 order by rank`, [id]);
  const [{ min }] = await tx.q<{ min: number | null }>(`select min_active_members as min from public.leaderboard_snapshots where id = $1`, [id]);
  return { id, ranks, min };
}

describe("RPC-snapshot_leaderboard — «بلا ترتيب»", () => {
  it("★ eligible_first: a company below the minimum ranks after every eligible one, though its per-member figure is higher", async () => {
    await withTx(async (tx) => {
      const { f, small, big } = await setup(tx);
      const s = await snapshot(tx, f.a.id);
      expect(s.min).toBe(3); // the org's default, frozen
      expect(s.ranks).toEqual([
        { company_id: big, rank: 1 },
        { company_id: small, rank: 2 },
      ]);
    });
  });

  it("with a minimum of one, the per-member figure alone decides — the small company leads", async () => {
    await withTx(async (tx) => {
      const { f, small } = await setup(tx);
      await tx.q(`update public.org_settings set company_min_active_members = 1 where org_id = $1`, [f.a.id]);
      const s = await snapshot(tx, f.a.id);
      expect(s.min).toBe(1);
      expect(s.ranks[0]).toEqual({ company_id: small, rank: 1 });
    });
  });

  it("★ min_frozen + final_untouched: a final snapshot keeps the minimum and the order it was taken under", async () => {
    await withTx(async (tx) => {
      const { f, big } = await setup(tx);
      const s = await snapshot(tx, f.a.id, true);
      await tx.q(`update public.org_settings set company_min_active_members = 1 where org_id = $1`, [f.a.id]);
      const [{ min }] = await tx.q<{ min: number }>(`select min_active_members as min from public.leaderboard_snapshots where id = $1`, [s.id]);
      expect(min).toBe(3);
      expect(await errorCode(() => tx.q(`update public.leaderboard_snapshots set min_active_members = 1 where id = $1`, [s.id]))).toBe("23514");
      const [{ company_id }] = await tx.q<{ company_id: string }>(`select company_id from public.leaderboard_entries where snapshot_id = $1 and rank = 1`, [s.id]);
      expect(company_id).toBe(big);
    });
  });

  it("only a COMPANY snapshot carries a minimum; the monthly members' board is ranked as before", async () => {
    await withTx(async (tx) => {
      const { f } = await setup(tx);
      const [{ id }] = await tx.q<{ id: string }>(`select public.snapshot_leaderboard($1, 'monthly', ${MONTH}, null, false) as id`, [f.a.id]);
      const [{ min }] = await tx.q<{ min: number | null }>(`select min_active_members as min from public.leaderboard_snapshots where id = $1`, [id]);
      expect(min).toBeNull();
      const ranks = await tx.q<{ points: number; rank: number }>(`select points, rank from public.leaderboard_entries where snapshot_id = $1 order by rank`, [id]);
      expect(ranks.map((r) => r.rank)).toEqual([1, 2]);
    });
  });
});
