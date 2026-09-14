// supabase/proposed/scoring/0002_award_points.sql — award_points() (05 §2.2)
// and its hook into check_in()'s TODO(scoring, M4) call site (STORY-PTS-001).
//
// 03 §8.2 rows proven here: RPC-award_points.definer_only,
// RPC-award_points.silent_skip, RPC-award_points.idempotent,
// POL-check_in.award_points_hook.
//
// The M4 schema (0027_m4_schema.sql) is already a real migration by the
// time this runs — only 0002_award_points.sql is applied via applyProposed,
// inside this test's own rolled-back transaction (DEC-040).
//
// Uses f.a.members[1] throughout, never members[0]: fixture-m4.ts seeds a
// 10-point `check_in` ledger row for every org's members[0] so the isolation
// sweep is never vacuous for points_ledger/points_balances — exactly the
// row that would otherwise contaminate an "award nothing" assertion here.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed, type Org } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  await applyProposed(tx, "scoring/0002_award_points.sql");
  return f;
}

/** A session in a chosen state, with explicit start/end — mirrors checkin.test.ts's helper. */
async function makeSession(tx: Tx, org: Org, opts: { state: string; startsInMinutes: number; endsInMinutes: number }): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة تسجيل نقاط', 'ملخص', $2, 'introductory',
             now() + ($3 || ' minutes')::interval, 60, now() + ($4 || ' minutes')::interval,
             $5, 40, $6::public.session_state,
             case when $6 in ('published','in_progress','completed','archived') then now() - interval '1 day' end,
             case when $6 = 'completed' then now() - interval '1 hour' end)
     returning id`,
    [org.id, org.categoryId, String(opts.startsInMinutes), String(opts.endsInMinutes), org.venueId, opts.state],
  );
  return row.id;
}

describe("RPC-award_points.definer_only", () => {
  it("no client role can call award_points() directly; only service_role and the owner can", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const call = () =>
        tx.q(`select public.award_points('check_in', $1, 'check_in', gen_random_uuid(), null)`, [f.a.members[1].memberId]);
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(call)).toBe(PERMISSION_DENIED);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(call)).toBe(PERMISSION_DENIED);
      await tx.asAnon();
      expect(await errorCode(call)).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      await call(); // does not throw
      await tx.asOwner();
      await call(); // does not throw
    });
  });
});

describe("RPC-award_points.silent_skip", () => {
  it("a disabled rule awards nothing and raises nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.q(`update public.scoring_rules set enabled = false where org_id = $1 and action_key = 'comment'`, [f.a.id]);
      await tx.asServiceRole();
      await tx.q(`select public.award_points('comment', $1, 'comment', gen_random_uuid(), null)`, [f.a.members[1].memberId]);
      await tx.asOwner(); // points_ledger's own select grant is authenticated-only, not service_role
      const rows = await tx.q(`select id from public.points_ledger where member_id = $1`, [f.a.members[1].memberId]);
      expect(rows).toEqual([]);
    });
  });

  it("an exhausted per-session cap awards nothing further (REQ-PTS-006)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      // comment ships with a 60s cooldown too (A10) — clear it so this test
      // isolates the cap, not the cooldown (that has its own test below).
      await tx.q(`update public.scoring_rules set cooldown = null where org_id = $1 and action_key = 'comment'`, [f.a.id]);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const member = f.a.members[1].memberId;
      await tx.asServiceRole();
      // comment caps at 5/session (A10) — award it five times, then a sixth.
      for (let i = 0; i < 5; i++) {
        await tx.q(`select public.award_points('comment', $1, 'comment', gen_random_uuid(), $2)`, [member, sessionId]);
      }
      await tx.asOwner();
      let rows = await tx.q(`select id from public.points_ledger where member_id = $1 and session_id = $2`, [member, sessionId]);
      expect(rows).toHaveLength(5);

      await tx.asServiceRole();
      await tx.q(`select public.award_points('comment', $1, 'comment', gen_random_uuid(), $2)`, [member, sessionId]);
      await tx.asOwner();
      rows = await tx.q(`select id from public.points_ledger where member_id = $1 and session_id = $2`, [member, sessionId]);
      expect(rows).toHaveLength(5); // the sixth earned nothing
    });
  });

  it("a live cooldown awards nothing until it elapses (REQ-PTS-007)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.q(`update public.scoring_rules set cooldown = interval '1 hour', cap_per_session = null where org_id = $1 and action_key = 'comment'`, [f.a.id]);
      const member = f.a.members[1].memberId;
      await tx.asServiceRole();
      await tx.q(`select public.award_points('comment', $1, 'comment', gen_random_uuid(), null)`, [member]);
      await tx.q(`select public.award_points('comment', $1, 'comment', gen_random_uuid(), null)`, [member]);
      await tx.asOwner();
      const rows = await tx.q(`select id from public.points_ledger where member_id = $1 and rule_key = 'comment'`, [member]);
      expect(rows).toHaveLength(1); // the second is inside the cooldown
    });
  });
});

describe("RPC-award_points.idempotent", () => {
  it("the same (rule, source, source_id, member) inserts at most one row (REQ-PTS-012)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const sourceId = (await tx.q<{ id: string }>(`select gen_random_uuid() as id`))[0].id;
      await tx.asServiceRole();
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, null)`, [member, sourceId]);
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, null)`, [member, sourceId]);
      await tx.asOwner();
      const rows = await tx.q(`select amount from public.points_ledger where member_id = $1 and source_id = $2`, [member, sourceId]);
      expect(rows).toEqual([{ amount: 20 }]);
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [member]);
      expect(balance.total_points).toBe(20); // not 40 — the replay wrote zero rows
    });
  });

  it("names the rule's Arabic reason and current version on the ledger row (REQ-PTS-003, REQ-PTS-004)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      await tx.asServiceRole();
      const sourceId = (await tx.q<{ id: string }>(`select gen_random_uuid() as id`))[0].id;
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, null)`, [member, sourceId]);
      await tx.asOwner();
      const [row] = await tx.q<{ reason: string; rule_version: number; amount: number }>(
        `select reason, rule_version, amount from public.points_ledger where member_id = $1 and source_id = $2`,
        [member, sourceId],
      );
      expect(row).toEqual({ reason: "تسجيل حضور مؤكَّد", rule_version: 1, amount: 20 });
    });
  });
});

describe("POL-check_in.award_points_hook", () => {
  it("a successful check-in enqueues exactly one award_points job, keyed by the check-in id", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await tx.asServiceRole();
      const [code] = await tx.q<{ code: string }>(`select * from public.rotate_check_in_code($1)`, [sessionId]);

      await tx.as(f.a.members[1].claims);
      const [row] = await tx.q<{ r: { status: string; check_in: { id: string } } }>(`select public.check_in($1, $2) as r`, [sessionId, code.code]);
      expect(row.r.status).toBe("ok");
      const checkInId = row.r.check_in.id;

      await tx.asOwner();
      const jobs = await tx.q<{ task_identifier: string; payload: { rule: string; source: string; source_id: string; member_id: string } }>(
        `select t.identifier as task_identifier, j.payload
           from graphile_worker._private_jobs j
           join graphile_worker._private_tasks t on t.id = j.task_id
          where j.key = $1`,
        [`pts:check_in:${checkInId}`],
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("award_points");
      expect(jobs[0].payload).toMatchObject({ rule: "check_in", source: "check_in", source_id: checkInId, member_id: f.a.members[1].memberId });

      // A repeat check-in (already_checked_in) enqueues nothing new — no
      // second job under a different key, and the same key isn't touched again.
      await tx.as(f.a.members[1].claims);
      const [again] = await tx.q<{ r: { status: string } }>(`select public.check_in($1, $2) as r`, [sessionId, code.code]);
      expect(again.r.status).toBe("already_checked_in");
      await tx.asOwner();
      const stillOne = await tx.q(`select id from graphile_worker.jobs where key = $1`, [`pts:check_in:${checkInId}`]);
      expect(stillOne).toHaveLength(1);
    });
  });

  it("end to end: running the enqueued job's SQL awards the check-in's points", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await tx.asServiceRole();
      const [code] = await tx.q<{ code: string }>(`select * from public.rotate_check_in_code($1)`, [sessionId]);

      await tx.as(f.a.members[1].claims);
      const [row] = await tx.q<{ r: { check_in: { id: string } } }>(`select public.check_in($1, $2) as r`, [sessionId, code.code]);
      const checkInId = row.r.check_in.id;

      // What worker/src/tasks/award_points.ts does with the enqueued payload.
      await tx.asOwner();
      const [job] = await tx.q<{ payload: { rule: string; member_id: string; source: string; source_id: string; session_id: string | null } }>(
        `select payload from graphile_worker._private_jobs where key = $1`,
        [`pts:check_in:${checkInId}`],
      );
      await tx.asServiceRole();
      await tx.q(`select public.award_points($1, $2, $3, $4, $5)`, [
        job.payload.rule,
        job.payload.member_id,
        job.payload.source,
        job.payload.source_id,
        job.payload.session_id,
      ]);

      await tx.asOwner();
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [f.a.members[1].memberId]);
      expect(balance.total_points).toBe(20);
    });
  });
});
