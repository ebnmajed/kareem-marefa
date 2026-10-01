// Wave 18 — the member's week on the home (REQ-UIX-055, DEC-206 §4.47 – §4.52, DEC-207 §1).
//
// What the week reads is read under RLS as it stands; what is proven here is that
// the reads `getMemberWeek()` and `getAchievementItems()` make answer what the plan
// says they answer — and the one function the week adds:
//
//   · `monthly_ranked_count()` counts the members a snapshot ranks, an opted-out
//     member's row included though the caller cannot read it (DEC-207 §1.2);
//   · an opted-out member is nobody's neighbour, and still reads their own rank
//     (REQ-LDR-008, DEC-207 §1.1);
//   · the week's acknowledgement moves the points cursor and leaves the level last
//     seen where it was (DEC-207 §1.3), and touches only the monthly board's columns.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "scoring/0002_monthly_ranked_count.sql";

/** A monthly snapshot of org A in a period nothing else uses: admin 1st, mod 2nd (opted out), members 3rd and 4th. */
async function setup(tx: Tx) {
  await applyProposed(tx, FILE);
  const f = await seed(tx);
  await tx.asOwner();
  await tx.q(`update public.members set leaderboard_opt_out = true where id = $1`, [f.a.mod.memberId]);
  const [snap] = await tx.q<{ id: string }>(
    `insert into public.leaderboard_snapshots (org_id, kind, period_start, period_end, active_member_count, is_final)
     values ($1, 'monthly', '2099-01-01', '2099-02-01', 4, false) returning id`,
    [f.a.id],
  );
  const rows: Array<[string, number, number]> = [
    [f.a.admin.memberId, 1, 90],
    [f.a.mod.memberId, 2, 70],
    [f.a.members[0].memberId, 3, 50],
    [f.a.members[1].memberId, 4, 20],
  ];
  for (const [member, rank, points] of rows) {
    await tx.q(`insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points) values ($1, $2, $3, $4, $5)`, [f.a.id, snap.id, member, rank, points]);
  }
  await tx.q(`insert into public.leaderboard_entries (org_id, snapshot_id, company_id, rank, points) values ($1, $2, $3, 1, 230)`, [f.a.id, snap.id, f.a.companyId]);
  return { f, snapshotId: snap.id };
}

/** The week's neighbour read: the visible entry with the greatest rank below the caller's. */
async function neighbourOf(tx: Tx, snapshotId: string, rank: number) {
  return tx.q<{ member_id: string; rank: number; points: number }>(
    `select member_id, rank, points from public.leaderboard_entries
      where snapshot_id = $1 and member_id is not null and rank < $2
      order by rank desc limit 1`,
    [snapshotId, rank],
  );
}

describe("RPC-monthly_ranked_count", () => {
  it("★ counts every member entry, an opted-out member's included, though the caller cannot read that row", async () => {
    await withTx(async (tx) => {
      const { f, snapshotId } = await setup(tx);
      await tx.as(f.a.members[1].claims);
      const visible = await tx.q(`select 1 from public.leaderboard_entries where snapshot_id = $1 and member_id is not null`, [snapshotId]);
      expect(visible).toHaveLength(3); // «#4 من 3» is what counting the visible rows would print
      expect(await tx.q(`select public.monthly_ranked_count($1) as n`, [snapshotId])).toEqual([{ n: 4 }]);
    });
  });

  it("does not count company entries", async () => {
    await withTx(async (tx) => {
      const { f, snapshotId } = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ n }] = await tx.q<{ n: number }>(`select public.monthly_ranked_count($1) as n`, [snapshotId]);
      expect(n).toBe(4);
    });
  });

  it("answers null for another org's snapshot, as for an unknown id", async () => {
    await withTx(async (tx) => {
      const { f, snapshotId } = await setup(tx);
      await tx.as(f.b.members[0].claims);
      expect(await tx.q(`select public.monthly_ranked_count($1) as n`, [snapshotId])).toEqual([{ n: null }]);
      expect(await tx.q(`select public.monthly_ranked_count(gen_random_uuid()) as n`)).toEqual([{ n: null }]);
    });
  });

  it("anon cannot execute it", async () => {
    await withTx(async (tx) => {
      const { snapshotId } = await setup(tx);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.monthly_ranked_count($1)`, [snapshotId]))).toBe("42501");
    });
  });
});

describe("the week's monthly reads", () => {
  it("★ an opted-out member is nobody's neighbour: the member below them sees the next visible row above", async () => {
    await withTx(async (tx) => {
      const { f, snapshotId } = await setup(tx);
      // members[0] is 3rd; above them the mod (2nd) opted out, so their neighbour is the admin (1st).
      await tx.as(f.a.members[0].claims);
      expect(await neighbourOf(tx, snapshotId, 3)).toEqual([{ member_id: f.a.admin.memberId, rank: 1, points: 90 }]);
    });
  });

  it("★ an opted-out member still reads their own rank (REQ-LDR-008)", async () => {
    await withTx(async (tx) => {
      const { f, snapshotId } = await setup(tx);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select rank, points from public.leaderboard_entries where snapshot_id = $1 and member_id = $2`, [snapshotId, f.a.mod.memberId])).toEqual([
        { rank: 2, points: 70 },
      ]);
    });
  });

  it("a member of another org reads none of it", async () => {
    await withTx(async (tx) => {
      const { f, snapshotId } = await setup(tx);
      await tx.as(f.b.members[0].claims);
      expect(await tx.q(`select 1 from public.leaderboard_entries where snapshot_id = $1`, [snapshotId])).toHaveLength(0);
      expect(await tx.q(`select 1 from public.leaderboard_snapshots where id = $1`, [snapshotId])).toHaveLength(0);
    });
  });
});

describe("the achievement items' reads", () => {
  it("★ a colleague's opt-out is visible to the reader, so the DAL can leave their badge out; their badge row is not hidden by RLS", async () => {
    await withTx(async (tx) => {
      const { f } = await setup(tx);
      await tx.asOwner();
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 and key = 'first_check_in'`, [f.a.id]);
      await tx.q(`insert into public.member_badges (org_id, member_id, badge_id) values ($1, $2, $3) on conflict do nothing`, [f.a.id, f.a.mod.memberId, badge.id]);
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q<{ opted: boolean }>(
        `select m.leaderboard_opt_out as opted from public.member_badges mb join public.members m on m.id = mb.member_id
          where mb.member_id = $1 and mb.badge_id = $2`,
        [f.a.mod.memberId, badge.id],
      );
      expect(rows).toEqual([{ opted: true }]);
    });
  });
});

describe("the week's acknowledgement (DEC-207 §1.3)", () => {
  it("★ passing the level last seen moves the points cursor and leaves the level where it was", async () => {
    await withTx(async (tx) => {
      const { f } = await setup(tx);
      const me = f.a.members[1];
      await tx.asOwner();
      const levels = await tx.q<{ id: string }>(`select id from public.levels where org_id = $1 order by sort_order`, [f.a.id]);
      await tx.q(`insert into public.member_seen_marks (member_id, org_id, points_total, level_id) values ($1, $2, 90, $3)`, [me.memberId, f.a.id, levels[0].id]);
      await tx.as(me.claims);
      // The week read level_id = levels[0] from the mark and passes it straight back, whatever the member holds now.
      await tx.q(`select public.mark_points_seen(gen_random_uuid(), 120, $1)`, [levels[0].id]);
      await tx.q(`select public.mark_board_seen('monthly', '2099-01-01', 4, null, null)`);
      expect(await tx.q(`select points_total, level_id, monthly_period::text, monthly_rank, all_time_rank, company_rank from public.member_seen_marks`)).toEqual([
        { points_total: 120, level_id: levels[0].id, monthly_period: "2099-01-01", monthly_rank: 4, all_time_rank: null, company_rank: null },
      ]);
    });
  });
});
