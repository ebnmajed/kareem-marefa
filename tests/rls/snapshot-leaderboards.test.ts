// supabase/proposed/scoring/0008_snapshot_leaderboards.sql —
// snapshot_leaderboard() (STORY-LDR-001…004, 11 §2.3, REQ-LDR-002,
// REQ-LDR-006, A11, DEC-016).
//
// 03 §8.2 rows proven here: RPC-snapshot_leaderboard.service_role_only,
// .frozen_denominator, .provisional_replace.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  await applyProposed(tx, "scoring/0008_snapshot_leaderboards.sql");
  return f;
}

describe("RPC-snapshot_leaderboard.service_role_only", () => {
  it("no client role may call it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.snapshot_leaderboard($1, 'monthly', null, null, null, false)`, [f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-snapshot_leaderboard — monthly", () => {
  it("ranks members by points earned inside the period, excluding a zero-or-negative net total", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const leader = f.a.members[1].memberId;
      const runnerUp = f.a.mod.memberId;
      const netZero = f.a.admin.memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key, occurred_at) values
           ($1, $2, 50, 'manual_adjustment', 'x', 'test:ldr:1', now()),
           ($1, $3, 20, 'manual_adjustment', 'x', 'test:ldr:2', now()),
           ($1, $4, 10, 'manual_adjustment', 'x', 'test:ldr:3', now()),
           ($1, $4, -10, 'manual_adjustment', 'x', 'test:ldr:4', now())`,
        [f.a.id, leader, runnerUp, netZero],
      );

      await tx.asServiceRole();
      const [snap] = await tx.q<{ snapshot_leaderboard: string }>(
        `select public.snapshot_leaderboard($1, 'monthly', $2::date, $3::date, null, false)`,
        [f.a.id, "2000-01-01", "2100-01-01"],
      );
      const snapshotId = snap.snapshot_leaderboard;

      await tx.asOwner();
      const entries = await tx.q<{ member_id: string; rank: number; points: number }>(
        `select member_id, rank, points from public.leaderboard_entries where snapshot_id = $1 order by rank`,
        [snapshotId],
      );
      // fixture-m4.ts seeds a 10-point check_in row for every org's
      // members[0] — it lands as rank 3 here, since this test does not
      // exclude that member the way other scoring tests do.
      expect(entries).toEqual([
        { member_id: leader, rank: 1, points: 50 },
        { member_id: runnerUp, rank: 2, points: 20 },
        { member_id: f.a.members[0].memberId, rank: 3, points: 10 },
      ]);
      expect(entries.find((e) => e.member_id === netZero)).toBeUndefined();
    });
  });
});

describe("RPC-snapshot_leaderboard.frozen_denominator", () => {
  it("active_member_count does not change after a member is later deactivated (05 §6.2)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 40, 'manual_adjustment', 'x', 'test:ldr:5')`,
        [f.a.id, f.a.members[1].memberId],
      );
      await tx.asServiceRole();
      const [snap] = await tx.q<{ snapshot_leaderboard: string }>(
        `select public.snapshot_leaderboard($1, 'company', null, null, null, false)`,
        [f.a.id],
      );
      const snapshotId = snap.snapshot_leaderboard;

      await tx.asOwner();
      const [before] = await tx.q<{ active_member_count: number }>(`select active_member_count from public.leaderboard_snapshots where id = $1`, [snapshotId]);
      await tx.q(
        `update public.members set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'اختبار' where id = $1`,
        [f.a.members[1].memberId],
      );
      const [after] = await tx.q<{ active_member_count: number }>(`select active_member_count from public.leaderboard_snapshots where id = $1`, [snapshotId]);
      expect(after.active_member_count).toBe(before.active_member_count); // frozen — deactivating a member does not rewrite it

      const entry = await tx.q<{ points_per_active_member: string }>(
        `select points_per_active_member from public.leaderboard_entries where snapshot_id = $1 and company_id = $2`,
        [snapshotId, f.a.companyId],
      );
      expect(entry).toHaveLength(1); // the company's own row exists with the frozen ratio
    });
  });
});

describe("RPC-snapshot_leaderboard.provisional_replace", () => {
  it("re-running a provisional snapshot for the same key replaces its entries; a final one cannot be replaced", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 10, 'manual_adjustment', 'x', 'test:ldr:6')`,
        [f.a.id, member],
      );
      await tx.asServiceRole();
      const [first] = await tx.q<{ snapshot_leaderboard: string }>(
        `select public.snapshot_leaderboard($1, 'monthly', $2::date, $3::date, null, false)`,
        [f.a.id, "2000-01-01", "2100-01-01"],
      );

      await tx.asOwner();
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values ($1, $2, 90, 'manual_adjustment', 'x', 'test:ldr:7')`,
        [f.a.id, member],
      );

      await tx.asServiceRole();
      const [second] = await tx.q<{ snapshot_leaderboard: string }>(
        `select public.snapshot_leaderboard($1, 'monthly', $2::date, $3::date, null, false)`,
        [f.a.id, "2000-01-01", "2100-01-01"],
      );

      await tx.asOwner();
      // The old provisional snapshot row is gone (replaced, not accumulated).
      const old = await tx.q(`select id from public.leaderboard_snapshots where id = $1`, [first.snapshot_leaderboard]);
      expect(old).toEqual([]);
      const [entry] = await tx.q<{ points: number }>(`select points from public.leaderboard_entries where snapshot_id = $1 and member_id = $2`, [
        second.snapshot_leaderboard,
        member,
      ]);
      expect(entry.points).toBe(100); // 10 + 90, from a fresh full recompute, not the old row plus new

      // Finalise it — a further re-run for the same key must now fail loudly.
      await tx.asOwner();
      await tx.q(`update public.leaderboard_snapshots set is_final = true where id = $1`, [second.snapshot_leaderboard]);
      expect(
        await errorCode(() => tx.q(`select public.snapshot_leaderboard($1, 'monthly', $2::date, $3::date, null, false)`, [f.a.id, "2000-01-01", "2100-01-01"])),
      ).toBe("23505"); // the final row survives the "delete provisional" step (its own guard would refuse that delete anyway), so the fresh insert collides on the natural key
    });
  });
});
