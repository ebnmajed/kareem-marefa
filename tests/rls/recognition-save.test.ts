// Wave 22, PR B — SCR-054's one Save and its «مُنحت» count (REQ-UIX-101, REQ-UIX-091, REQ-REC-001, -003, -005, -006,
// DEC-232 §3, §4 row 2).
//
// supabase/proposed/scoring/save_recognition.sql — invoker, one transaction, answering with the history rows it wrote.
//
// 03 §8.2 rows proven here: RPC-save_recognition.{admin_only,one_transaction,receipt,no_op,stale,levels_climb,
// levels_swap,badge_created,retire_keeps_holders,bonus_points_untouched}; RPC-badge_holder_counts.own_org.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  await applyProposed(tx, "scoring/save_recognition.sql");
  return seed(tx);
}

type Level = { id: string; name: string; threshold_points: number; updated_at: string };
async function levels(tx: Tx, org: Org): Promise<Level[]> {
  await tx.asOwner();
  return tx.q<Level>(`select id, name, threshold_points, updated_at::text from public.levels where org_id = $1 order by sort_order`, [org.id]);
}

type Receipt = { at: string | null; wrote: string[] };
async function save(tx: Tx, p: { levels?: unknown[]; badges?: unknown[]; perks?: unknown[]; streaks?: unknown[] }): Promise<Receipt> {
  const [{ r }] = await tx.q<{ r: Receipt }>(`select public.save_recognition($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as r`, [
    JSON.stringify(p.levels ?? []),
    JSON.stringify(p.badges ?? []),
    JSON.stringify(p.perks ?? []),
    JSON.stringify(p.streaks ?? []),
  ]);
  return r;
}

describe("RPC-save_recognition", () => {
  it("receipt — a level renamed and its threshold moved: both recorded, the receipt names them", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [, second, third] = await levels(tx, f.a);
      await tx.as(f.a.admin.claims);
      const receipt = await save(tx, { levels: [{ ...second, name: "مشارِك فاعل", threshold_points: second.threshold_points + 1 }] });
      expect(receipt.wrote).toEqual(["levels.name", "levels.threshold_points"]);
      expect(receipt.at).not.toBeNull();
      expect((await levels(tx, f.a))[1]).toMatchObject({ name: "مشارِك فاعل", threshold_points: second.threshold_points + 1 });
      expect((await levels(tx, f.a))[2].threshold_points).toBe(third.threshold_points);
    });
  });

  it("★ no_op — an unchanged form writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const all = await levels(tx, f.a);
      await tx.as(f.a.admin.claims);
      expect(await save(tx, { levels: all })).toEqual({ at: null, wrote: [] });
    });
  });

  it("levels_climb — a threshold at or below the level before it is refused at that level, and nothing is written", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [first, second, third] = await levels(tx, f.a);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => save(tx, { levels: [{ ...third, threshold_points: second.threshold_points }] }))).toBe("23505");
      expect(await errorCode(() => save(tx, { levels: [{ ...second, name: "س" }, { ...third, threshold_points: first.threshold_points }] }))).toBe("22023");
      expect((await levels(tx, f.a))[1].name).toBe(second.name);
    });
  });

  it("★ levels_swap — two thresholds moved past each other's old values in one save, with no transient duplicate", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [, second, third, fourth] = await levels(tx, f.a);
      await tx.as(f.a.admin.claims);
      // second rises to third's old value, third rises to fourth's old value minus one.
      await save(tx, { levels: [{ ...second, threshold_points: third.threshold_points }, { ...third, threshold_points: fourth.threshold_points - 1 }] });
      const after = await levels(tx, f.a);
      expect([after[1].threshold_points, after[2].threshold_points]).toEqual([third.threshold_points, fourth.threshold_points - 1]);
    });
  });

  it("stale — a form read before another save is refused", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [, second] = await levels(tx, f.a);
      await tx.as(f.a.admin.claims);
      // The form was read before another admin's save moved the row on.
      expect(await errorCode(() => save(tx, { levels: [{ ...second, name: "قديم", updated_at: "2000-01-01 00:00:00+00" }] }))).toBe("40001");
    });
  });

  it("admin_only — a moderator is refused", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [, second] = await levels(tx, f.a);
      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => save(tx, { levels: [{ ...second, name: "مشرف" }] }))).toBe("42501");
    });
  });

  it("badge_created — a new badge gets a key nobody typed and a `created` history row", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      const created = await save(tx, {
        badges: [{ id: null, name: "عدسة القاعة", description: null, issues_certificate: false, rule: { metric: "check_ins_count", gte: 10 }, retired: false }],
      });
      expect(created.wrote).toEqual(["badges.created"]);
      await tx.asOwner();
      const [badge] = await tx.q<{ key: string }>(`select key from public.badges where org_id = $1 and name = 'عدسة القاعة'`, [f.a.id]);
      expect(badge.key).toMatch(/^custom_[0-9a-f]{12}$/);
    });
  });

  it("retire_keeps_holders — retiring writes retired_at alone, and the member still holds the badge", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      // A badge the org already has (written with no member behind it, as a seed is — so no history row of its own).
      const [badge] = await tx.q<{ id: string; name: string; description: string | null; issues_certificate: boolean; rule: unknown; updated_at: string }>(
        `insert into public.badges (org_id, key, name, rule) values ($1, 'test_lens', 'عدسة القاعة', '{"metric":"check_ins_count","gte":10}')
         returning id, name, description, issues_certificate, rule, updated_at::text`,
        [f.a.id],
      );
      await tx.q(`insert into public.member_badges (org_id, member_id, badge_id) values ($1, $2, $3)`, [f.a.id, f.a.members[0].memberId, badge.id]);
      await tx.as(f.a.admin.claims);
      const retired = await save(tx, { badges: [{ ...badge, retired: true }] });
      expect(retired.wrote).toEqual(["badges.retired_at"]);
      expect(await tx.q(`select badge_id, holders from public.badge_holder_counts() where badge_id = $1`, [badge.id])).toEqual([{ badge_id: badge.id, holders: 1 }]);
    });
  });

  it("★ bonus_points_untouched — a streak save writes its count and switch, never bonus_points", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [streak] = await tx.q<{ id: string; required_count: number; bonus_points: number; updated_at: string }>(
        `select id, required_count, bonus_points, updated_at::text from public.streak_rules where org_id = $1 limit 1`,
        [f.a.id],
      );
      await tx.as(f.a.admin.claims);
      const receipt = await save(tx, { streaks: [{ id: streak.id, updated_at: streak.updated_at, required_count: streak.required_count + 1, enabled: true, bonus_points: 999 }] });
      expect(receipt.wrote).toEqual(["streaks.required_count"]);
      await tx.asOwner();
      expect(await tx.q(`select bonus_points from public.streak_rules where id = $1`, [streak.id])).toEqual([{ bonus_points: streak.bonus_points }]);
    });
  });

  it("one_transaction — a stale perk at the end leaves the level edit before it unwritten", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [, second] = await levels(tx, f.a);
      await tx.asOwner();
      const [perk] = await tx.q<{ id: string; enabled: boolean; required_level_id: string | null; required_badge_id: string | null }>(
        `select id, enabled, required_level_id, required_badge_id from public.perks where org_id = $1 limit 1`,
        [f.a.id],
      );
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() => save(tx, { levels: [{ ...second, name: "لن يُحفظ" }], perks: [{ ...perk, updated_at: "2000-01-01T00:00:00Z" }] })),
      ).toBe("40001");
      expect((await levels(tx, f.a))[1].name).toBe(second.name);
    });
  });
});

describe("RPC-badge_holder_counts.own_org", () => {
  it("counts the caller's org only; anon cannot execute it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [b] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 limit 1`, [f.b.id]);
      await tx.q(`insert into public.member_badges (org_id, member_id, badge_id) values ($1, $2, $3) on conflict do nothing`, [f.b.id, f.b.members[0].memberId, b.id]);
      await tx.as(f.a.members[0].claims);
      expect((await tx.q<{ badge_id: string }>(`select badge_id from public.badge_holder_counts()`)).map((r) => r.badge_id)).not.toContain(b.id);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.badge_holder_counts()`))).toBe("42501");
    });
  });
});
