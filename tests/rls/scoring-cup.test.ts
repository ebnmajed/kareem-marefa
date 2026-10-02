// Wave 20, PR B — «كأس الربع» (DEC-219 §2 as corrected, REQ-UIX-079, REQ-LDR-006). The nightly
// `snapshot_leaderboards` task (worker/src/tasks/snapshot_leaderboards.ts) takes the company race's QUARTER as a
// `company` snapshot whose period is a calendar quarter: the current one provisional, the previous one final ONCE.
// ★ A final quarter is frozen by 0027's guards: a re-run skips it, and nothing can rewrite its entries.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";
import { snapshot_leaderboards } from "../../worker/src/tasks/snapshot_leaderboards";

afterAll(() => pool.end());

/** The task, run inside the test's transaction as the worker's role would run it (the owner, here). */
async function runTask(tx: Tx) {
  await tx.asOwner();
  const helpers = {
    query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await tx.q(sql, params)) as R[] }),
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await snapshot_leaderboards({}, helpers as any);
}

const quarterRows = (tx: Tx, orgId: string) =>
  tx.q<{ start: string; end: string; is_final: boolean }>(
    `select period_start::text as start, period_end::text as "end", is_final from public.leaderboard_snapshots
      where org_id = $1 and kind = 'company' and period_end - period_start > 40 order by period_start`,
    [orgId],
  );

describe("JOB-snapshot_leaderboards — the quarter", () => {
  it("★ takes the current quarter provisional and the previous quarter final, as `company` snapshots", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 30, 'manual_adjustment', 'اختبار', 'test:cup:1')`, [f.a.id, f.a.members[0].memberId]);
      await runTask(tx);
      const [{ qs, qe, ps, pe }] = await tx.q<{ qs: string; qe: string; ps: string; pe: string }>(
        `select date_trunc('quarter', now())::date::text as qs, (date_trunc('quarter', now()) + interval '3 months')::date::text as qe,
                date_trunc('quarter', now() - interval '3 months')::date::text as ps, date_trunc('quarter', now())::date::text as pe`,
      );
      expect(await quarterRows(tx, f.a.id)).toEqual([
        { start: ps, end: pe, is_final: true },
        { start: qs, end: qe, is_final: false },
      ]);
      // The current quarter ranks the company that earned points this quarter.
      const entries = await tx.q<{ company_id: string; rank: number; points: number }>(
        `select e.company_id, e.rank, e.points from public.leaderboard_entries e join public.leaderboard_snapshots s on s.id = e.snapshot_id
          where s.org_id = $1 and s.kind = 'company' and s.period_start = $2 and s.period_end = $3`,
        [f.a.id, qs, qe],
      );
      expect(entries).toEqual([{ company_id: f.a.companyId, rank: 1, points: 30 }]);
    });
  });

  it("★ a second night re-takes the current quarter and SKIPS the final one — no error, no duplicate", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await runTask(tx);
      await runTask(tx);
      const rows = await quarterRows(tx, f.a.id);
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.is_final)).toHaveLength(1);
    });
  });

  it("★ a final quarter cannot be rewritten — the cup handed over cannot move (0027's guards)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await runTask(tx);
      const [{ id }] = await tx.q<{ id: string }>(
        `select id from public.leaderboard_snapshots where org_id = $1 and kind = 'company' and is_final and period_end - period_start > 40`,
        [f.a.id],
      );
      expect(await errorCode(() => tx.q(`update public.leaderboard_snapshots set active_member_count = 999 where id = $1`, [id]))).toBe("23514");
      expect(await errorCode(() => tx.q(`delete from public.leaderboard_snapshots where id = $1`, [id]))).toBe("23514");
    });
  });

  it("the month's company snapshots are taken as before, beside the quarter's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await runTask(tx);
      const months = await tx.q(
        `select 1 from public.leaderboard_snapshots where org_id = $1 and kind = 'company' and period_end - period_start between 28 and 31`,
        [f.a.id],
      );
      expect(months.length).toBeGreaterThanOrEqual(1);
    });
  });
});
