// supabase/proposed/scoring/0001_m4_schema.sql — the M4 schema (05 whole,
// 02 §4.9-4.11, 03 §5.7, CLAUDE.md invariant 9, DEC-046).
//
// 03 §8.2 rows proven here: POL-scoring_rules.select, .update.admin,
// .catalogue, .immutable_key, .history; POL-points_ledger.insert, .update,
// .select, .idempotency; POL-points_balances.select; POL-badges.select,
// .update.admin; POL-levels.select, .update.admin; POL-streak_rules.select,
// .update.admin; POL-perks.select, .update.admin; POL-member_badges.select;
// POL-member_perks.select; POL-streak_awards.select;
// POL-leaderboard_snapshots.select, .immutable; POL-leaderboard_entries
// .select.opt_out, .immutable; POL-orgs.seed_scoring.
//
// Applied inside the test's own rolled-back transaction (applyProposed,
// DEC-040) — nothing here touches the real migrations or the shared
// database.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seedBase } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

// Promoted as migration 0027 at wave-2 sync 1: the schema is applied by
// `supabase db reset`, so nothing here applies it.
async function ready(tx: Tx) {
  const f = await seedBase(tx);
  await tx.asOwner();
  return f;
}

describe("POL-orgs.seed_scoring", () => {
  it("seeds all five catalogues the moment an org row exists, and A10's shape", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);

      const rules = await tx.q<{ action_key: string; points: number; enabled: boolean; cap_per_session: number | null }>(
        `select action_key, points, enabled, cap_per_session from public.scoring_rules where org_id = $1 order by action_key`,
        [f.a.id],
      );
      expect(rules).toHaveLength(14);
      expect(rules.find((r) => r.action_key === "rsvp")).toBeUndefined();
      const checkIn = rules.find((r) => r.action_key === "check_in")!;
      expect(checkIn).toMatchObject({ points: 20, enabled: true });
      const noShow = rules.find((r) => r.action_key === "no_show")!;
      expect(noShow).toMatchObject({ points: 0, enabled: true }); // D40: present, enabled, worth 0
      const attendeeBonus = rules.find((r) => r.action_key === "attendee_bonus")!;
      expect(attendeeBonus.cap_per_session).toBe(30); // occurrences, not points (05 §3.2 footgun)

      const badges = await tx.q<{ key: string }>(`select key from public.badges where org_id = $1`, [f.a.id]);
      expect(badges).toHaveLength(8);

      const levels = await tx.q<{ name: string; threshold_points: number; sort_order: number }>(
        `select name, threshold_points, sort_order from public.levels where org_id = $1 order by sort_order`,
        [f.a.id],
      );
      expect(levels.map((l) => l.threshold_points)).toEqual([0, 100, 300, 700, 1500]);

      const streakRules = await tx.q(`select id from public.streak_rules where org_id = $1`, [f.a.id]);
      expect(streakRules).toHaveLength(1);

      const perks = await tx.q<{ key: string; enabled: boolean }>(
        `select key, enabled from public.perks where org_id = $1 order by key`,
        [f.a.id],
      );
      expect(perks).toEqual([
        { key: "can_host", enabled: false }, // REQ-REC-008: off unless the org turns it on
        { key: "priority_rsvp", enabled: false }, // ships off too (sync 7): the window exists only once the org turns the perk on
      ]);

      // Both orgs seeded independently — never one org's rows for another's.
      const rulesB = await tx.q(`select id from public.scoring_rules where org_id = $1`, [f.b.id]);
      expect(rulesB).toHaveLength(14);
    });
  });

  it("re-seeding an org is a no-op (on conflict do nothing)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.q(`select public._seed_org_scoring($1)`, [f.a.id]);
      const rules = await tx.q(`select id from public.scoring_rules where org_id = $1`, [f.a.id]);
      expect(rules).toHaveLength(14);
    });
  });
});

describe("POL-scoring_rules", () => {
  it("select — any member reads the org's catalogue; not another org's", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.members[0].claims);
      const mine = await tx.q(`select id from public.scoring_rules where org_id = $1`, [f.a.id]);
      expect(mine).toHaveLength(14);
      const theirs = await tx.q(`select id from public.scoring_rules where org_id = $1`, [f.b.id]);
      expect(theirs).toEqual([]);
    });
  });

  it("catalogue — inserting action_key = 'rsvp' is rejected (REQ-PTS-010)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      const code = await errorCode(() =>
        tx.q(
          `insert into public.scoring_rules (org_id, action_key, actor, points, reason_ar)
           values ($1, 'rsvp', 'attendee', 100, 'x')`,
          [f.a.id],
        ),
      );
      expect(code).toBe("23514");
      // 'reaction', 'view', 'bookmark', 'task_completion' are equally absent (D42/D30).
      for (const key of ["reaction", "view", "bookmark", "task_completion"]) {
        expect(
          await errorCode(() =>
            tx.q(
              `insert into public.scoring_rules (org_id, action_key, actor, points, reason_ar)
               values ($1, $2, 'attendee', 1, 'x')`,
              [f.a.id, key],
            ),
          ),
        ).toBe("23514");
      }
    });
  });

  it("update.admin — a moderator changing a point value is rejected; an admin succeeds, version bumps, history records it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.mod.claims);
      // RLS filters the row out of the moderator's UPDATE rather than raising
      // (org_settings' own test uses the same shape) — zero rows match, zero change.
      const asMod = await tx.q(`update public.scoring_rules set points = 999 where org_id = $1 and action_key = 'check_in' returning id`, [f.a.id]);
      expect(asMod).toEqual([]);

      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ version: number; points: number }>(
        `update public.scoring_rules set points = 25 where org_id = $1 and action_key = 'check_in' returning version, points`,
        [f.a.id],
      );
      expect(row).toEqual({ version: 2, points: 25 });

      const history = await tx.q<{ field: string; old_value: unknown; new_value: unknown; actor_id: string }>(
        `select field, old_value, new_value, actor_id from public.scoring_config_history
          where org_id = $1 and scope = 'scoring' and field = 'points'
          order by changed_at desc limit 1`,
        [f.a.id],
      );
      expect(history).toEqual([{ field: "points", old_value: 20, new_value: 25, actor_id: f.a.admin.memberId }]);
    });
  });

  it("immutable_key — action_key and actor cannot be changed by update, even by an admin", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() => tx.q(`update public.scoring_rules set action_key = 'comment' where org_id = $1 and action_key = 'check_in'`, [f.a.id])),
      ).toBe(PERMISSION_DENIED);
      expect(
        await errorCode(() => tx.q(`update public.scoring_rules set actor = 'presenter' where org_id = $1 and action_key = 'check_in'`, [f.a.id])),
      ).toBe(PERMISSION_DENIED);
    });
  });

  it("delete — no role may delete a catalogue row", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() => tx.q(`delete from public.scoring_rules where org_id = $1 and action_key = 'check_in'`, [f.a.id])),
      ).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect(
        await errorCode(() => tx.q(`delete from public.scoring_rules where org_id = $1 and action_key = 'check_in'`, [f.a.id])),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-points_ledger", () => {
  it("insert — direct insert is rejected for authenticated AND service_role", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const insert = () =>
        tx.q(
          `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
           values ($1, $2, 10, 'check_in', 'x', 'test:direct')`,
          [f.a.id, f.a.members[0].memberId],
        );
      await tx.as(f.a.admin.claims);
      expect(await errorCode(insert)).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect(await errorCode(insert)).toBe(PERMISSION_DENIED);
    });
  });

  it("update/delete — raise for every role including service_role and the migration owner's ordinary grant path", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [row] = await tx.q<{ id: string }>(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
         values ($1, $2, 20, 'check_in', 'تسجيل حضور مؤكَّد', 'test:ledger:1') returning id`,
        [f.a.id, f.a.members[0].memberId],
      );
      for (const become of [() => tx.as(f.a.admin.claims), () => tx.asServiceRole()] as const) {
        await become();
        expect(await errorCode(() => tx.q(`update public.points_ledger set amount = 1 where id = $1`, [row.id]))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`delete from public.points_ledger where id = $1`, [row.id]))).toBe(PERMISSION_DENIED);
      }
    });
  });

  it("select — a member reads only their own rows; an admin reads the org's", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
         values ($1, $2, 20, 'check_in', 'x', 'test:ledger:2')`,
        [f.a.id, f.a.members[0].memberId],
      );
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.points_ledger where org_id = $1`, [f.a.id])).toEqual([]);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.points_ledger where org_id = $1`, [f.a.id])).toHaveLength(1);
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select id from public.points_ledger where org_id = $1`, [f.a.id])).toHaveLength(1);
    });
  });

  it("idempotency — the key is unique; award_points() (STORY-PTS-001) is what turns a collision into on-conflict-do-nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
         values ($1, $2, 20, 'check_in', 'x', 'test:dup')`,
        [f.a.id, f.a.members[0].memberId],
      );
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
             values ($1, $2, 20, 'check_in', 'x', 'test:dup')`,
            [f.a.id, f.a.members[0].memberId],
          ),
        ),
      ).toBe("23505");
    });
  });
});

describe("ENT-points_balances rollup", () => {
  it("is a left fold over the ledger, and rebuild reproduces it exactly (05 §2.3, §4.2)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const m = f.a.members[0].memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key) values
           ($1, $2, 20, 'check_in', 'x', 'test:roll:1'),
           ($1, $2, 5,  'rating',   'x', 'test:roll:2'),
           ($1, $2, -3, 'reversal', 'x', 'test:roll:3')`,
        [f.a.id, m],
      );
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [m]);
      expect(balance.total_points).toBe(22);

      // Rebuild: safe because the ledger is insert-only (nothing to un-apply).
      await tx.q(`truncate public.points_balances`);
      await tx.q(
        `insert into public.points_balances (org_id, member_id, total_points, last_entry_id)
         select org_id, member_id, sum(amount), (array_agg(id order by occurred_at desc))[1]
           from public.points_ledger group by org_id, member_id`,
      );
      const [rebuilt] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [m]);
      expect(rebuilt.total_points).toBe(22);
    });
  });

  it("select is org-wide; no client role may write", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select member_id from public.points_balances where org_id = $1`, [f.a.id])).toEqual([]);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.points_balances (org_id, member_id, total_points) values ($1, $2, 1)`, [f.a.id, f.a.members[1].memberId]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe.each([
  ["badges", "key", "first_check_in"],
  ["levels", "sort_order", 1],
  ["streak_rules", "key", "monthly_3"],
  ["perks", "key", "priority_rsvp"],
])("POL-%s", (table, col, val) => {
  it("select.member / update.admin — a moderator write is rejected, an admin's succeeds, delete never works", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.${table} where org_id = $1 and ${col} = $2`, [f.a.id, val])).toHaveLength(1);

      await tx.as(f.a.mod.claims);
      const asMod = await tx.q(`update public.${table} set updated_at = now() where org_id = $1 and ${col} = $2 returning id`, [f.a.id, val]);
      expect(asMod).toEqual([]); // RLS filters the row out rather than raising

      await tx.as(f.a.admin.claims);
      expect((await tx.q(`update public.${table} set updated_at = now() where org_id = $1 and ${col} = $2 returning id`, [f.a.id, val]))).toHaveLength(1);

      expect(await errorCode(() => tx.q(`delete from public.${table} where org_id = $1 and ${col} = $2`, [f.a.id, val]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe.each(["member_badges", "member_perks", "streak_awards"])("POL-%s.select", (table) => {
  it("org-wide read; no client role may write (job/admin RPC only)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select * from public.${table} where org_id = $1`, [f.a.id])).toEqual([]);
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`insert into public.${table} (org_id) values ($1)`, [f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-leaderboard_snapshots", () => {
  it("select is org-scoped; no client role writes; a final snapshot is immutable even to the owner", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [snap] = await tx.q<{ id: string }>(
        `insert into public.leaderboard_snapshots (org_id, kind, active_member_count) values ($1, 'all_time', 3) returning id`,
        [f.a.id],
      );
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.leaderboard_snapshots where org_id = $1`, [f.a.id])).toHaveLength(1);
      expect(await errorCode(() => tx.q(`update public.leaderboard_snapshots set is_final = true where id = $1`, [snap.id]))).toBe(PERMISSION_DENIED);

      await tx.asOwner();
      await tx.q(`update public.leaderboard_snapshots set is_final = true where id = $1`, [snap.id]);
      expect(await errorCode(() => tx.q(`update public.leaderboard_snapshots set active_member_count = 99 where id = $1`, [snap.id]))).toBe("23514");
      expect(await errorCode(() => tx.q(`delete from public.leaderboard_snapshots where id = $1`, [snap.id]))).toBe("23514");
    });
  });
});

describe("POL-leaderboard_entries", () => {
  it("select.opt_out — an opted-out member is absent from another's view, present in their own; the company row is unchanged (REQ-LDR-008)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [snap] = await tx.q<{ id: string }>(
        `insert into public.leaderboard_snapshots (org_id, kind, active_member_count) values ($1, 'all_time', 3) returning id`,
        [f.a.id],
      );
      const optOut = f.a.members[1].memberId;
      await tx.q(`update public.members set leaderboard_opt_out = true where id = $1`, [optOut]);
      await tx.q(
        `insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points) values
           ($1, $2, $3, 1, 40),
           ($1, $2, $4, 2, 90)`,
        [f.a.id, snap.id, f.a.members[0].memberId, optOut],
      );
      await tx.q(
        `insert into public.leaderboard_entries (org_id, snapshot_id, company_id, rank, points, points_per_active_member)
         values ($1, $2, $3, 3, 130, 43.3)`,
        [f.a.id, snap.id, f.a.companyId],
      );

      await tx.as(f.a.members[0].claims); // not opted out, viewing others
      const seenByOther = await tx.q<{ member_id: string | null }>(`select member_id from public.leaderboard_entries where org_id = $1 order by rank`, [f.a.id]);
      expect(seenByOther.map((r) => r.member_id)).toEqual([f.a.members[0].memberId, null]); // opted-out member gone, company row stays

      await tx.as(f.a.members[1].claims); // the opted-out member, viewing their own board
      const seenBySelf = await tx.q<{ member_id: string | null }>(`select member_id from public.leaderboard_entries where org_id = $1 order by rank`, [f.a.id]);
      expect(seenBySelf.map((r) => r.member_id)).toEqual([f.a.members[0].memberId, optOut, null]); // sees themselves too
    });
  });

  it("immutable — entries of a final snapshot cannot be updated or deleted", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [snap] = await tx.q<{ id: string }>(
        `insert into public.leaderboard_snapshots (org_id, kind, active_member_count, is_final) values ($1, 'all_time', 3, true) returning id`,
        [f.a.id],
      );
      const [entry] = await tx.q<{ id: string }>(
        `insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points) values ($1, $2, $3, 1, 40) returning id`,
        [f.a.id, snap.id, f.a.members[0].memberId],
      );
      expect(await errorCode(() => tx.q(`update public.leaderboard_entries set rank = 2 where id = $1`, [entry.id]))).toBe("23514");
      expect(await errorCode(() => tx.q(`delete from public.leaderboard_entries where id = $1`, [entry.id]))).toBe("23514");
    });
  });

  it("check — exactly one of member_id / company_id, never both or neither", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [snap] = await tx.q<{ id: string }>(
        `insert into public.leaderboard_snapshots (org_id, kind, active_member_count) values ($1, 'all_time', 3) returning id`,
        [f.a.id],
      );
      expect(
        await errorCode(() => tx.q(`insert into public.leaderboard_entries (org_id, snapshot_id, rank, points) values ($1, $2, 1, 10)`, [f.a.id, snap.id])),
      ).toBe("23514");
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.leaderboard_entries (org_id, snapshot_id, member_id, company_id, rank, points) values ($1, $2, $3, $4, 1, 10)`,
            [f.a.id, snap.id, f.a.members[0].memberId, f.a.companyId],
          ),
        ),
      ).toBe("23514");
    });
  });
});
