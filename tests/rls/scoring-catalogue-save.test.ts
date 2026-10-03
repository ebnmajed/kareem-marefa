// Wave 22, PR B — SCR-053's one Save (REQ-UIX-100, REQ-UIX-091, REQ-PTS-004, REQ-PTS-005, DEC-232 §3).
//
// supabase/proposed/scoring/save_scoring_catalogue.sql — invoker, one transaction, answering with the history rows it
// wrote. ★ And the job the page exists for (DEC-231 §0.3): a rule edited here is what the member reads and what the next
// award pays, while every row already written keeps its amount, its reason and its rule_version.
//
// 03 §8.2 rows proven here: RPC-save_scoring_catalogue.{admin_only,one_transaction,receipt,no_op,stale,sign,forward_only}.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  await applyProposed(tx, "scoring/save_scoring_catalogue.sql");
  return seed(tx);
}

type Rule = { id: string; version: number; points: number; enabled: boolean; cap_per_session: number | null; cooldown_seconds: number | null; reason_ar: string };

async function rule(tx: Tx, org: Org, actionKey: string): Promise<Rule> {
  await tx.asOwner();
  const [r] = await tx.q<Rule>(
    `select id, version, points, enabled, cap_per_session, extract(epoch from cooldown)::int as cooldown_seconds, reason_ar
       from public.scoring_rules where org_id = $1 and action_key = $2`,
    [org.id, actionKey],
  );
  return r;
}

type Receipt = { at: string | null; wrote: string[] };
async function save(tx: Tx, rules: Rule[], company: unknown[] = []): Promise<Receipt> {
  const [{ r }] = await tx.q<{ r: Receipt }>(`select public.save_scoring_catalogue($1::jsonb, $2::jsonb) as r`, [JSON.stringify(rules), JSON.stringify(company)]);
  return r;
}

describe("RPC-save_scoring_catalogue", () => {
  it("receipt — one save of two rules: both written, and the receipt names exactly the fields it changed", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const comment = await rule(tx, f.a, "comment");
      const checkIn = await rule(tx, f.a, "check_in");
      await tx.as(f.a.admin.claims);
      const receipt = await save(tx, [
        { ...comment, points: comment.points + 2, reason_ar: "تعليق مفيد" },
        { ...checkIn, cap_per_session: 1 },
      ]);
      expect(receipt.wrote).toEqual(["check_in.cap_per_session", "comment.points", "comment.reason_ar"]);
      expect(receipt.at).not.toBeNull();
      expect((await rule(tx, f.a, "comment")).version).toBe(comment.version + 1);
    });
  });

  it("★ no_op — an unchanged form writes no row and bumps no version; the receipt is empty («لم يتغيّر شيء»)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const comment = await rule(tx, f.a, "comment");
      await tx.as(f.a.admin.claims);
      expect(await save(tx, [comment])).toEqual({ at: null, wrote: [] });
      await tx.asOwner();
      expect((await rule(tx, f.a, "comment")).version).toBe(comment.version);
      expect(await tx.q(`select id from public.scoring_config_history where entity_id = $1`, [comment.id])).toEqual([]);
    });
  });

  it("admin_only — a moderator and a member are refused, and nothing is written", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const comment = await rule(tx, f.a, "comment");
      for (const who of [f.a.mod, f.a.members[0]]) {
        await tx.as(who.claims);
        expect(await errorCode(() => save(tx, [{ ...comment, points: 99 }]))).toBe("42501");
      }
      expect((await rule(tx, f.a, "comment")).points).toBe(comment.points);
    });
  });

  it("one_transaction — a refusal on the last rule writes none of the earlier ones", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const comment = await rule(tx, f.a, "comment");
      const noShow = await rule(tx, f.a, "no_show");
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => save(tx, [{ ...comment, points: 9 }, { ...noShow, points: 5 }]))).toBe("22023");
      expect((await rule(tx, f.a, "comment")).points).toBe(comment.points);
    });
  });

  it("sign — a reward cannot be saved negative; a deduction is saved negative as its cost", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const comment = await rule(tx, f.a, "comment");
      const noShow = await rule(tx, f.a, "no_show");
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => save(tx, [{ ...comment, points: -1 }]))).toBe("22023");
      expect((await save(tx, [{ ...noShow, points: -10 }])).wrote).toEqual(["no_show.points"]);
    });
  });

  it("stale — a form read before someone else's save is refused", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const comment = await rule(tx, f.a, "comment");
      await tx.as(f.a.admin.claims);
      await save(tx, [{ ...comment, points: comment.points + 1 }]);
      expect(await errorCode(() => save(tx, [{ ...comment, points: comment.points + 5 }]))).toBe("40001");
    });
  });

  it("company rules save in the same call, recorded under company_scoring", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [host] = await tx.q<{ id: string; version: number; points: number }>(
        `select id, version, points from public.company_scoring_rules where org_id = $1 and action_key = 'company_hosting'`,
        [f.a.id],
      );
      await tx.as(f.a.admin.claims);
      const receipt = await save(tx, [], [{ id: host.id, version: host.version, enabled: true, points: host.points + 5, points_per_percent: null, cap_points: null, min_active_members: null }]);
      expect(receipt.wrote).toEqual(["company_hosting.points"]);
    });
  });

  it("★ forward_only — after an edit the member reads the new rule and the next award pays it; the row already written does not move", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const me = f.a.members[0];
      const before = await rule(tx, f.a, "comment");
      // A row written under the rule as it stood.
      const [old] = await tx.q<{ id: string }>(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, reason, rule_key, rule_version, idempotency_key)
         values ($1, $2, $3, 'comment', gen_random_uuid(), $4, 'comment', $5, 'test:forward:old') returning id`,
        [f.a.id, me.memberId, before.points, before.reason_ar, before.version],
      );

      await tx.as(f.a.admin.claims);
      // No cap and no cooldown, so the award below is decided by the value alone.
      await save(tx, [{ ...before, points: before.points + 7, cap_per_session: null, cooldown_seconds: null, reason_ar: "تعليق مفيد" }]);

      // What SCR-022's catalogue reads (points.ts — `scoring_rules`, live), as the member.
      await tx.as(me.claims);
      expect(await tx.q(`select points, reason_ar from public.scoring_rules where org_id = $1 and action_key = 'comment'`, [f.a.id])).toEqual([
        { points: before.points + 7, reason_ar: "تعليق مفيد" },
      ]);
      // The row already written: untouched.
      expect(await tx.q(`select amount, reason, rule_version from public.points_ledger where id = $1`, [old.id])).toEqual([
        { amount: before.points, reason: before.reason_ar, rule_version: before.version },
      ]);

      // The next award, as the worker writes it: the new amount, the new version.
      await tx.asOwner();
      const [c] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق بعد التعديل') returning id`,
        [f.a.id, f.m2.a.published, me.memberId],
      );
      await tx.asServiceRole();
      await tx.q(`select public.award_points('comment', $1, 'comment', $2, $3)`, [me.memberId, c.id, f.m2.a.published]);
      await tx.asOwner();
      const [next] = await tx.q<{ amount: number; rule_version: number }>(`select amount, rule_version from public.points_ledger where source_id = $1`, [c.id]);
      expect(next).toEqual({ amount: before.points + 7, rule_version: before.version + 1 });
    });
  });
});
