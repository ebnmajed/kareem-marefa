// supabase/proposed/scoring/0009_all_time_leaderboard.sql —
// all_time_leaderboard() (STORY-LDR-001, REQ-LDR-001, REQ-LDR-008).
//
// 03 §8.2 row proven here: RPC-all_time_leaderboard.opt_out.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  await applyProposed(tx, "scoring/0009_all_time_leaderboard.sql");
  return f;
}

describe("RPC-all_time_leaderboard.opt_out", () => {
  it("an opted-out member is absent from another's board, present on their own; ranks live off points_balances", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const leader = f.a.members[1].memberId;
      const optedOut = f.a.mod.memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values
           ($1, $2, 50, 'manual_adjustment', 'x', 'test:atl:1'),
           ($1, $3, 30, 'manual_adjustment', 'x', 'test:atl:2')`,
        [f.a.id, leader, optedOut],
      );
      await tx.q(`update public.members set leaderboard_opt_out = true where id = $1`, [optedOut]);

      await tx.as(f.a.members[1].claims);
      const seenByLeader = await tx.q<{ member_id: string }>(`select member_id from public.all_time_leaderboard()`);
      expect(seenByLeader.map((r) => r.member_id)).not.toContain(optedOut);
      expect(seenByLeader.map((r) => r.member_id)).toContain(leader);

      await tx.as(f.a.mod.claims); // the opted-out member themselves
      const seenBySelf = await tx.q<{ member_id: string }>(`select member_id from public.all_time_leaderboard()`);
      expect(seenBySelf.map((r) => r.member_id)).toContain(optedOut);
    });
  });

  it("no anonymous read; every org sees only its own board", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.all_time_leaderboard()`))).toBe(PERMISSION_DENIED);

      await tx.as(f.b.admin.claims);
      const rows = await tx.q<{ member_id: string }>(`select member_id from public.all_time_leaderboard()`);
      expect(rows.map((r) => r.member_id)).not.toContain(f.a.members[0].memberId);
    });
  });
});
