// supabase/proposed/scoring/0007 + 0008 — invariant 9 after presenter epochs:
// a presenter paid, reversed and paid again after completion leaves a ledger
// that the rollup, audit_balances() and a full rebuild all agree on.
//
// 03 §8.2 rows proven here: RPC-rebuild_points_balances.after_presenter_epochs,
// RPC-audit_balances.silent_after_presenter_epochs.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  for (const file of ["0006_session_award_state", "0007_award_at_completion", "0008_presenter_awards", "0009_counting_completed"]) {
    await applyProposed(tx, `scoring/${file}.sql`);
  }
  await tx.asOwner();
  return f;
}

describe("RPC-rebuild_points_balances.after_presenter_epochs / RPC-audit_balances.silent_after_presenter_epochs", () => {
  it("+50, −50, +50: the rollup equals the ledger, the audit reports nothing, and a rebuild reproduces it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[1].memberId;
      const [s] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                       venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
         values ($1, 'جلسة إعادة الحساب', 'ملخص', $2, 'introductory', now() - interval '60 days', 60,
                 now() - interval '60 days' + interval '1 hour', $3, 40, 'completed', now() - interval '100 days', now() - interval '1 hour', true)
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      const pay = async () => {
        await tx.asServiceRole();
        await tx.q(`select public.award_points('session_delivered', $1, 'session_delivered', $2, $2)`, [presenter, s.id]);
        await tx.asOwner();
      };
      const add = () => tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s.id, presenter]);
      await add();
      await pay();
      await tx.q(`delete from public.session_presenters where session_id = $1 and member_id = $2`, [s.id, presenter]);
      await add();
      await pay();

      const rows = await tx.q<{ amount: number }>(`select amount from public.points_ledger where member_id = $1 and session_id = $2 order by occurred_at, id`, [presenter, s.id]);
      expect(rows.map((r) => r.amount)).toEqual([50, -50, 50]);

      const read = async () => {
        await tx.asOwner();
        const [row] = await tx.q<{ rolled: number | null; summed: string | null; last_entry_id: string | null }>(
          `select (select total_points from public.points_balances where member_id = $1) as rolled,
                  (select sum(amount)::text from public.points_ledger where member_id = $1) as summed,
                  (select last_entry_id from public.points_balances where member_id = $1) as last_entry_id`,
          [presenter],
        );
        return row;
      };
      const before = await read();
      expect(Number(before.rolled ?? 0)).toBe(Number(before.summed ?? 0));
      await tx.asServiceRole();
      expect(await tx.q(`select member_id from public.audit_balances()`)).toEqual([]);
      await tx.q(`select public.rebuild_points_balances()`);
      const after = await read();
      expect(Number(after.rolled)).toBe(Number(before.rolled));
      expect(after.last_entry_id).toBe(before.last_entry_id);
      await tx.asServiceRole();
      expect(await tx.q(`select member_id from public.audit_balances()`)).toEqual([]);
    });
  });
});
