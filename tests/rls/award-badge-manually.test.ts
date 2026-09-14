// supabase/proposed/scoring/0011_award_badge_manually.sql —
// award_badge_manually() (SCR-054, REQ-REC-001, REQ-REC-002).
//
// 03 §8.2 rows proven here: RPC-award_badge_manually.admin_only,
// .reason_mandatory, .idempotent.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  await applyProposed(tx, "scoring/0011_award_badge_manually.sql");
  return f;
}

describe("RPC-award_badge_manually.admin_only", () => {
  it("a moderator and a plain member are refused; a fresh admin succeeds", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 and key = 'annual'`, [f.a.id]);

      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => tx.q(`select * from public.award_badge_manually($1, $2, 'تكريم سنوي')`, [member, badge.id]))).toBe(PERMISSION_DENIED);
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select * from public.award_badge_manually($1, $2, 'تكريم سنوي')`, [member, badge.id]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ member_id: string; badge_id: string; awarded_by: string; award_reason: string }>(
        `select member_id, badge_id, awarded_by, award_reason from public.award_badge_manually($1, $2, 'تكريم سنوي مستحَق')`,
        [member, badge.id],
      );
      expect(row).toEqual({ member_id: member, badge_id: badge.id, awarded_by: f.a.admin.memberId, award_reason: "تكريم سنوي مستحَق" });
    });
  });
});

describe("RPC-award_badge_manually.reason_mandatory", () => {
  it("an empty reason raises before anything is written", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 and key = 'annual'`, [f.a.id]);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.award_badge_manually($1, $2, '')`, [f.a.members[1].memberId, badge.id]))).toBe("23514");
      expect(await errorCode(() => tx.q(`select * from public.award_badge_manually($1, $2, null)`, [f.a.members[1].memberId, badge.id]))).toBe("23514");
    });
  });

  it("another org's member or badge is refused", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [badgeA] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 and key = 'annual'`, [f.a.id]);
      const [badgeB] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 and key = 'annual'`, [f.b.id]);

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.award_badge_manually($1, $2, 'x')`, [f.b.members[0].memberId, badgeA.id]))).toBe("P0002");
      expect(await errorCode(() => tx.q(`select * from public.award_badge_manually($1, $2, 'x')`, [f.a.members[1].memberId, badgeB.id]))).toBe("P0002");
    });
  });
});

describe("RPC-award_badge_manually.idempotent", () => {
  it("awarding the same badge twice is a no-op, not an error, and returns the original row", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 and key = 'annual'`, [f.a.id]);
      await tx.as(f.a.admin.claims);
      const [first] = await tx.q<{ id: string; award_reason: string }>(`select id, award_reason from public.award_badge_manually($1, $2, 'أول')`, [member, badge.id]);
      const [second] = await tx.q<{ id: string; award_reason: string }>(`select id, award_reason from public.award_badge_manually($1, $2, 'ثانٍ')`, [member, badge.id]);
      expect(second.id).toBe(first.id);
      expect(second.award_reason).toBe("أول"); // the original stands; a repeat award does not overwrite it

      await tx.asOwner();
      const rows = await tx.q(`select id from public.member_badges where member_id = $1 and badge_id = $2`, [member, badge.id]);
      expect(rows).toHaveLength(1);
    });
  });
});
