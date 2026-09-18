// supabase/migrations/0123_recognition_history.sql — recognition edits are
// recorded (REQ-REC-001 … 005, REQ-PTS-005, REQ-ADM-018). Carried since wave 8;
// row L9 of wave 10 (DEC-160). The lead's, as custodian of `scoring` and
// `console`.
//
// 03 §8.2 rows proven here: POL-badges.history, POL-levels.history,
// POL-perks.history, POL-streak_rules.history,
// POL-recognition.history.no_forgery.
//
// Every write below is made the way `src/lib/dal/scoring-admin.ts` makes it —
// a plain statement through RLS, as the admin — because the point of a trigger
// is that it sees the writer the screen actually is.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seedBase } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

interface HistoryRow {
  scope: string;
  entity_id: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  actor_id: string | null;
}

async function history(tx: Tx, orgId: string, scope: string): Promise<HistoryRow[]> {
  await tx.asOwner();
  // Ordered by field, never by `changed_at`: it defaults to the transaction's
  // start and is identical for every row one test writes.
  return tx.q<HistoryRow>(
    `select scope, entity_id, field, old_value, new_value, actor_id
       from public.scoring_config_history
      where org_id = $1 and scope = $2
      order by field`,
    [orgId, scope],
  );
}

describe("POL-recognition.history — the seed is not a change", () => {
  it("an org's seeded badges, levels, perks and streak rules append no history", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await tx.asOwner();
      const [{ seeded }] = await tx.q<{ seeded: number }>(
        `select (select count(*) from public.badges where org_id = $1)
              + (select count(*) from public.levels where org_id = $1)
              + (select count(*) from public.perks where org_id = $1)
              + (select count(*) from public.streak_rules where org_id = $1) as seeded`,
        [f.a.id],
      );
      // Non-vacuous: the catalogue WAS seeded, by a writer with no member behind it.
      expect(Number(seeded)).toBeGreaterThan(0);
      for (const scope of ["badges", "levels", "perks", "streaks"]) {
        expect(await history(tx, f.a.id, scope)).toEqual([]);
      }
    });
  });
});

describe("POL-badges.history", () => {
  it("an admin's edit appends one row per changed column, with old and new values and the actor", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await tx.asOwner();
      const [badge] = await tx.q<{ id: string; name: string; issues_certificate: boolean }>(
        `select id, name, issues_certificate from public.badges where org_id = $1 order by key limit 1`,
        [f.a.id],
      );

      await tx.as(f.a.admin.claims);
      const changed = await tx.q(
        `update public.badges set name = $2, issues_certificate = $3 where id = $1 returning id`,
        [badge.id, "وسام جديد", !badge.issues_certificate],
      );
      expect(changed).toHaveLength(1);

      expect(await history(tx, f.a.id, "badges")).toEqual([
        { scope: "badges", entity_id: badge.id, field: "issues_certificate", old_value: badge.issues_certificate, new_value: !badge.issues_certificate, actor_id: f.a.admin.memberId },
        { scope: "badges", entity_id: badge.id, field: "name", old_value: badge.name, new_value: "وسام جديد", actor_id: f.a.admin.memberId },
      ]);
    });
  });

  it("retiring a badge is a recorded change, and a save that changes nothing records nothing", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await tx.asOwner();
      const [badge] = await tx.q<{ id: string; name: string }>(`select id, name from public.badges where org_id = $1 order by key limit 1`, [f.a.id]);

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.badges set name = $2 where id = $1`, [badge.id, badge.name]);
      expect(await history(tx, f.a.id, "badges")).toEqual([]);

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.badges set retired_at = '2026-09-17T00:00:00Z' where id = $1`, [badge.id]);
      const rows = await history(tx, f.a.id, "badges");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ field: "retired_at", old_value: null, actor_id: f.a.admin.memberId });
      expect(rows[0].new_value).not.toBeNull();
    });
  });

  it("a custom badge an admin creates appends one `created` row carrying the badge, without its bookkeeping", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await tx.as(f.a.admin.claims);
      const [created] = await tx.q<{ id: string }>(
        `insert into public.badges (org_id, key, name, description, rule, issues_certificate)
         values ($1, 'custom_wave10', 'وسام الاستبانة', null, '{}'::jsonb, false) returning id`,
        [f.a.id],
      );

      const rows = await history(tx, f.a.id, "badges");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ entity_id: created.id, field: "created", old_value: null, actor_id: f.a.admin.memberId });
      const value = rows[0].new_value as Record<string, unknown>;
      expect(value).toMatchObject({ key: "custom_wave10", name: "وسام الاستبانة", issues_certificate: false });
      for (const bookkeeping of ["id", "org_id", "created_at", "updated_at"]) expect(value).not.toHaveProperty(bookkeeping);
    });
  });
});

describe("POL-levels.history", () => {
  it("moving a level's threshold records the old and the new value", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await tx.asOwner();
      // The top level: raising its threshold cannot collide with a neighbour's.
      const [level] = await tx.q<{ id: string; threshold_points: number }>(
        `select id, threshold_points from public.levels where org_id = $1 order by threshold_points desc limit 1`,
        [f.a.id],
      );

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.levels set threshold_points = $2 where id = $1`, [level.id, level.threshold_points + 50]);

      expect(await history(tx, f.a.id, "levels")).toEqual([
        { scope: "levels", entity_id: level.id, field: "threshold_points", old_value: level.threshold_points, new_value: level.threshold_points + 50, actor_id: f.a.admin.memberId },
      ]);
    });
  });
});

describe("POL-perks.history", () => {
  it("switching a perk records the switch", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await tx.asOwner();
      const [perk] = await tx.q<{ id: string; enabled: boolean }>(`select id, enabled from public.perks where org_id = $1 order by key limit 1`, [f.a.id]);

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.perks set enabled = $2 where id = $1`, [perk.id, !perk.enabled]);

      expect(await history(tx, f.a.id, "perks")).toEqual([
        { scope: "perks", entity_id: perk.id, field: "enabled", old_value: perk.enabled, new_value: !perk.enabled, actor_id: f.a.admin.memberId },
      ]);
    });
  });
});

describe("POL-streak_rules.history", () => {
  it("changing a streak's bonus records it under the scope the history table has always named `streaks`", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await tx.asOwner();
      const [rule] = await tx.q<{ id: string; bonus_points: number }>(`select id, bonus_points from public.streak_rules where org_id = $1 order by key limit 1`, [f.a.id]);

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.streak_rules set bonus_points = $2 where id = $1`, [rule.id, rule.bonus_points + 5]);

      expect(await history(tx, f.a.id, "streaks")).toEqual([
        { scope: "streaks", entity_id: rule.id, field: "bonus_points", old_value: rule.bonus_points, new_value: rule.bonus_points + 5, actor_id: f.a.admin.memberId },
      ]);
    });
  });
});

describe("POL-recognition.history.no_forgery", () => {
  it("a moderator's refused edit appends nothing, and the other org's history is untouched", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await tx.asOwner();
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 order by key limit 1`, [f.a.id]);

      await tx.as(f.a.mod.claims);
      // RLS filters the row out of a moderator's UPDATE rather than raising.
      expect(await tx.q(`update public.badges set name = 'لا' where id = $1 returning id`, [badge.id])).toEqual([]);
      expect(await history(tx, f.a.id, "badges")).toEqual([]);

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.badges set name = 'نعم' where id = $1`, [badge.id]);
      expect(await history(tx, f.a.id, "badges")).toHaveLength(1);
      expect(await history(tx, f.b.id, "badges")).toEqual([]);
    });
  });

  it("no client role can write a history row of its own — the admin included", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await tx.as(f.a.admin.claims);
      // `tx.q` runs each statement under its own savepoint, so a refusal does
      // not abort the transaction.
      const refused = await errorCode(() =>
        tx.q(
          `insert into public.scoring_config_history (org_id, scope, field, old_value, new_value, actor_id)
           values ($1, 'badges', 'name', '"أ"'::jsonb, '"ب"'::jsonb, $2)`,
          [f.a.id, f.a.mod.memberId],
        ),
      );
      expect(refused).toBe(PERMISSION_DENIED);
      expect(await history(tx, f.a.id, "badges")).toEqual([]);
    });
  });
});
