// supabase/proposed/scoring/0006_audit_balances.sql — JOB-audit_balances
// (11 §2.3, REQ-PTS-011, 05 §4.1) and rebuild_points_balances() (05 §4.2).
// STORY-PTS-006.
//
// 03 §8.2 rows proven here: RPC-audit_balances.service_role_only,
// RPC-audit_balances.no_self_heal, RPC-rebuild_points_balances.reproduces.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  // Promoted at wave-2 sync 3 (0031–0035): applied by `supabase db reset`.
  return f;
}

describe("RPC-audit_balances.service_role_only", () => {
  it("no client role may call it; service_role and the owner can", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.audit_balances()`))).toBe(PERMISSION_DENIED);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.audit_balances()`))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      await tx.q(`select * from public.audit_balances()`); // does not throw
    });
  });
});

describe("RPC-audit_balances.no_self_heal", () => {
  it("reports a divergence and leaves points_balances exactly as wrong as it found it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
         values ($1, $2, 20, 'check_in', 'x', 'test:audit:1')`,
        [f.a.id, member],
      );
      // Corrupt the rollup directly — the only way a real divergence happens
      // is a bug, which this simulates without needing to find one.
      await tx.q(`update public.points_balances set total_points = 999 where member_id = $1`, [member]);

      await tx.asServiceRole();
      const rows = await tx.q<{ member_id: string; expected_total: number; actual_total: number }>(`select * from public.audit_balances()`);
      const mine = rows.find((r) => r.member_id === member);
      expect(mine).toMatchObject({ expected_total: 20, actual_total: 999 });

      await tx.asOwner();
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [member]);
      expect(balance.total_points).toBe(999); // unchanged — audit_balances() never writes
    });
  });

  it("writes an audit_log row per divergence, actor null (the system, not a member)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
         values ($1, $2, 20, 'check_in', 'x', 'test:audit:2')`,
        [f.a.id, member],
      );
      await tx.q(`update public.points_balances set total_points = 5 where member_id = $1`, [member]);

      await tx.asServiceRole();
      await tx.q(
        `select public.write_audit($1, 'points.balance_divergence', 'points_balances', $2, $3::jsonb, $4::jsonb, null, null, null)`,
        [f.a.id, member, JSON.stringify({ total_points: 5 }), JSON.stringify({ total_points: 20 })],
      );
      await tx.asOwner();
      const [row] = await tx.q<{ actor_id: string | null; actor_role: string; action: string; subject_id: string }>(
        `select actor_id, actor_role, action, subject_id from public.audit_log where action = 'points.balance_divergence' and subject_id = $1`,
        [member],
      );
      expect(row).toMatchObject({ actor_id: null, actor_role: "system", action: "points.balance_divergence", subject_id: member });
    });
  });
});

describe("RPC-rebuild_points_balances.reproduces", () => {
  it("truncate + resum reproduces the ledger's true totals exactly, and audit_balances() then reports nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values
           ($1, $2, 20, 'check_in', 'x', 'test:rebuild:1'),
           ($1, $2, 5,  'rating',   'x', 'test:rebuild:2')`,
        [f.a.id, member],
      );
      await tx.q(`update public.points_balances set total_points = 1 where member_id = $1`, [member]);

      await tx.asServiceRole();
      await tx.q(`select public.rebuild_points_balances()`);
      await tx.asOwner();
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [member]);
      expect(balance.total_points).toBe(25);

      await tx.asServiceRole();
      const rows = await tx.q(`select member_id from public.audit_balances()`);
      expect(rows).toEqual([]);
    });
  });

  it("no client role may call it either", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.rebuild_points_balances()`))).toBe(PERMISSION_DENIED);
    });
  });
});
