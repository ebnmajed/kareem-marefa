// SCR-054's writes — REQ-REC-001, REQ-REC-003, REQ-REC-006, REQ-ADM-020.
//
// Wave 8 (K4) made the recognition screen create badges, rename them and edit
// their rules, rename levels and choose a perk's qualifier. None of it needed
// SQL: `0027` already grants insert/update on `badges`, `levels` and `perks` to
// `authenticated`, behind `p2_admin_insert`/`p2_admin_update`. This proves the
// boundary those writes now lean on — an admin may, a moderator may not (a
// moderator «reaches moderation queues, event-day operations and content
// removal — and nothing else»), and another org's admin reaches nothing.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-badges.insert.admin — REQ-REC-001's «create»", () => {
  it("an admin creates a badge in their own org; a moderator is refused; nobody creates one in another org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const insert = (orgId: string, key: string) =>
        tx.q(`insert into public.badges (org_id, key, name, rule) values ($1, $2, 'شارة جديدة', '{"metric":"check_ins_count","gte":25}'::jsonb) returning id`, [orgId, key]);

      await tx.as(f.a.admin.claims);
      expect(await insert(f.a.id, "custom_admin")).toHaveLength(1);

      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => insert(f.a.id, "custom_mod"))).toBe("42501");

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => insert(f.b.id, "custom_cross"))).toBe("42501");
    });
  });
});

describe("POL-badges.update / levels.update / perks.update — a moderator changes nothing", () => {
  it("renaming a badge and a level, and choosing a perk's qualifier: the admin's rows change, the moderator's updates touch no row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 order by key limit 1`, [f.a.id]);
      const [level] = await tx.q<{ id: string }>(`select id from public.levels where org_id = $1 order by sort_order limit 1`, [f.a.id]);
      const [perk] = await tx.q<{ id: string }>(`select id from public.perks where org_id = $1 and key = 'can_host'`, [f.a.id]);

      const rename = () => tx.q(`update public.badges set name = 'اسم جديد', rule = '{"metric":"manual"}'::jsonb where id = $1 returning id`, [badge.id]);
      const retitle = () => tx.q(`update public.levels set name = 'لقب جديد' where id = $1 returning id`, [level.id]);
      const requalify = () => tx.q(`update public.perks set required_level_id = null, required_badge_id = $1 where id = $2 returning id`, [badge.id, perk.id]);

      await tx.as(f.a.mod.claims);
      expect(await rename()).toHaveLength(0);
      expect(await retitle()).toHaveLength(0);
      expect(await requalify()).toHaveLength(0);

      await tx.as(f.b.admin.claims);
      expect(await rename()).toHaveLength(0);

      await tx.as(f.a.admin.claims);
      expect(await rename()).toHaveLength(1);
      expect(await retitle()).toHaveLength(1);
      expect(await requalify()).toHaveLength(1);
    });
  });

  it("a perk cannot be left with no qualifier at all — the schema's own check", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const [perk] = await tx.q<{ id: string }>(`select id from public.perks where org_id = $1 and key = 'priority_rsvp'`, [f.a.id]);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`update public.perks set required_level_id = null, required_badge_id = null where id = $1`, [perk.id]))).toBe("23514");
    });
  });
});
