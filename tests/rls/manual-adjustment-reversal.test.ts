// supabase/proposed/scoring/0005_manual_adjustment_and_reversal.sql — the
// admin manual adjustment RPC (05 §7, REQ-PTS-009) and reversal-on-removal
// for comments (05 §2.4, REQ-PTS-013). STORY-PTS-004, STORY-PTS-005.
//
// 03 §8.2 rows proven here: RPC-adjust_points_manually.admin_only,
// RPC-adjust_points_manually.audited, POL-comments.reversal_hook.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  await applyProposed(tx, "scoring/0005_manual_adjustment_and_reversal.sql");
  return f;
}

describe("RPC-adjust_points_manually.admin_only", () => {
  it("a moderator and a plain member are refused; a fresh admin succeeds", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;

      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => tx.q(`select * from public.adjust_points_manually($1, 15, 'مكافأة')`, [member]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select * from public.adjust_points_manually($1, 15, 'مكافأة')`, [member]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ amount: number; reason: string; source: string; actor_id: string }>(
        `select amount, reason, source, actor_id from public.adjust_points_manually($1, 15, 'مكافأة تشجيعية')`,
        [member],
      );
      expect(row).toEqual({ amount: 15, reason: "مكافأة تشجيعية", source: "manual_adjustment", actor_id: f.a.admin.memberId });
    });
  });

  it("an empty reason or a zero amount raises before anything is written", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.adjust_points_manually($1, 10, '')`, [f.a.members[1].memberId]))).toBe("23514");
      expect(await errorCode(() => tx.q(`select * from public.adjust_points_manually($1, 10, null)`, [f.a.members[1].memberId]))).toBe("23514");
      expect(await errorCode(() => tx.q(`select * from public.adjust_points_manually($1, 0, 'سبب')`, [f.a.members[1].memberId]))).toBe("23514");
    });
  });

  it("another org's member is refused (REQ-TEN-003)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.adjust_points_manually($1, 10, 'سبب')`, [f.b.members[0].memberId]))).toBe("P0002");
    });
  });

  it("a stale admin (claims_version mismatch) is refused", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.q(`update public.members set claims_version = claims_version + 1 where id = $1`, [f.a.admin.memberId]);
      await tx.as(f.a.admin.claims); // carries the OLD claims_version
      expect(await errorCode(() => tx.q(`select * from public.adjust_points_manually($1, 10, 'سبب')`, [f.a.members[1].memberId]))).toBe(PERMISSION_DENIED);
    });
  });

  it("is never deduplicated — two adjustments with identical arguments both land (05 §7)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.adjust_points_manually($1, 10, 'مكافأة')`, [f.a.members[1].memberId]);
      await tx.q(`select * from public.adjust_points_manually($1, 10, 'مكافأة')`, [f.a.members[1].memberId]);
      const rows = await tx.q(`select id from public.points_ledger where member_id = $1 and source = 'manual_adjustment'`, [f.a.members[1].memberId]);
      expect(rows).toHaveLength(2);
    });
  });
});

describe("RPC-adjust_points_manually.audited", () => {
  it("the ledger row and the audit_log row commit together, naming the admin", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      const [ledger] = await tx.q<{ id: string }>(`select * from public.adjust_points_manually($1, -5, 'تصحيح خطأ')`, [f.a.members[1].memberId]);
      const [audit] = await tx.q<{ actor_id: string; action: string; reason: string; subject_id: string }>(
        `select actor_id, action, reason, subject_id from public.audit_log where subject_id = $1`,
        [ledger.id],
      );
      expect(audit).toEqual({ actor_id: f.a.admin.memberId, action: "points.manual_adjustment", reason: "تصحيح خطأ", subject_id: ledger.id });
    });
  });
});

describe("POL-comments.reversal_hook", () => {
  it("removing a comment that earned points writes a compensating reversal row, and evaluates the off-by-default penalty", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const author = f.a.members[1].memberId;
      await tx.as(f.a.members[1].claims);
      const [comment] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق سيُحذف') returning id`,
        [f.a.id, f.m2.a.completed, author],
      );

      // What the worker would have done for this comment's award_points job.
      await tx.asServiceRole();
      await tx.q(`select public.award_points('comment', $1, 'comment', $2, $3)`, [author, comment.id, f.m2.a.completed]);
      await tx.asOwner();
      let [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [author]);
      expect(balance.total_points).toBe(2); // comment's A10 default

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.comments set deleted_at = now(), deleted_by = $1 where id = $2`, [f.a.admin.memberId, comment.id]);

      await tx.asOwner();
      const reversal = await tx.q<{ amount: number; reason: string }>(
        `select amount, reason from public.points_ledger where source = 'reversal' and source_id in
           (select id from public.points_ledger where source = 'comment' and source_id = $1)`,
        [comment.id],
      );
      expect(reversal).toEqual([{ amount: -2, reason: "حُذف المحتوى" }]);

      // comment_removed ships enabled with points = 0 (D40) — the penalty
      // event is present even though it costs nothing by default.
      const penalty = await tx.q<{ amount: number; rule_key: string }>(
        `select amount, rule_key from public.points_ledger where rule_key = 'comment_removed' and source_id = $1`,
        [comment.id],
      );
      expect(penalty).toEqual([{ amount: 0, rule_key: "comment_removed" }]);

      ([balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [author]));
      expect(balance.total_points).toBe(0); // the award and its reversal net to zero
    });
  });

  it("removing a comment that earned nothing (already capped) reverses nothing, but the penalty event still fires", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const author = f.a.members[1].memberId;
      await tx.q(`update public.scoring_rules set enabled = false where org_id = $1 and action_key = 'comment'`, [f.a.id]);
      await tx.as(f.a.members[1].claims);
      const [comment] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق لم يُكافأ') returning id`,
        [f.a.id, f.m2.a.completed, author],
      );
      // Disabled rule — no award happens (this is exactly what a real
      // capped/disabled comment looks like when its award_points job runs).
      await tx.asServiceRole();
      await tx.q(`select public.award_points('comment', $1, 'comment', $2, $3)`, [author, comment.id, f.m2.a.completed]);

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.comments set deleted_at = now(), deleted_by = $1 where id = $2`, [f.a.admin.memberId, comment.id]);

      await tx.asOwner();
      const reversal = await tx.q(
        `select id from public.points_ledger where source = 'reversal' and source_id in
           (select id from public.points_ledger where source = 'comment' and source_id = $1)`,
        [comment.id],
      );
      expect(reversal).toEqual([]); // no original award existed, so nothing to reverse
      const penalty = await tx.q<{ amount: number }>(`select amount from public.points_ledger where rule_key = 'comment_removed' and source_id = $1`, [comment.id]);
      expect(penalty).toEqual([{ amount: 0 }]);
    });
  });

  it("remove, restore, remove again reverses only once (the idempotency key absorbs the second removal)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const author = f.a.members[1].memberId;
      await tx.as(f.a.members[1].claims);
      const [comment] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق آخر') returning id`,
        [f.a.id, f.m2.a.completed, author],
      );
      await tx.asServiceRole();
      await tx.q(`select public.award_points('comment', $1, 'comment', $2, $3)`, [author, comment.id, f.m2.a.completed]);

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.comments set deleted_at = now(), deleted_by = $1 where id = $2`, [f.a.admin.memberId, comment.id]); // remove
      await tx.q(`update public.comments set deleted_at = null, deleted_by = null where id = $1`, [comment.id]); // restore
      await tx.q(`update public.comments set deleted_at = now(), deleted_by = $1 where id = $2`, [f.a.admin.memberId, comment.id]); // remove again

      await tx.asOwner();
      const reversals = await tx.q(
        `select id from public.points_ledger where source = 'reversal' and source_id in
           (select id from public.points_ledger where source = 'comment' and source_id = $1)`,
        [comment.id],
      );
      expect(reversals).toHaveLength(1);
    });
  });
});
