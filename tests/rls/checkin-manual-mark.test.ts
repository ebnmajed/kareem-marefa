// Manual attendance marking's window — DEC-141 ruling 6 —
// supabase/proposed/checkin/03_manual_mark.sql, applied with
// applyProposed() inside this test's rolled-back transaction (DEC-040).
//
// `03` §8.2 rows: RPC-mark_checked_in_manually.window,
// RPC-mark_checked_in_manually.award_points.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorMessage, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["checkin/03_manual_mark.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

async function makeSession(tx: Tx, org: Org, opts: { state: string; startsInMinutes: number; endsInMinutes: number }): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'جلسة تسجيل يدوي', 'ملخص', $2, 'introductory',
             now() + ($3 || ' minutes')::interval, 60, now() + ($4 || ' minutes')::interval,
             $5, 40, $6::public.session_state,
             case when $6 in ('published','in_progress','completed','archived') then now() - interval '1 day' end,
             case when $6 = 'completed' then now() - interval '1 hour' end,
             true)
     returning id`,
    [org.id, org.categoryId, String(opts.startsInMinutes), String(opts.endsInMinutes), org.venueId, opts.state],
  );
  return row.id;
}

describe("RPC-mark_checked_in_manually.window", () => {
  it("an admin marks a member present ANY time after the scheduled start, no ceiling, even on an archived session", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      // 10 hours past the scheduled end — well past the 2h ceiling that
      // gates the code family, and archived (my own addition, flagged).
      const sessionId = await makeSession(tx, f.a, { state: "archived", startsInMinutes: -900, endsInMinutes: -840 });
      await tx.as(f.a.admin.claims);
      const [ci] = await tx.q<{ method: string }>(`select * from public.mark_checked_in_manually($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "تصحيح لاحق"]);
      expect(ci.method).toBe("manual");
    });
  });

  it("an admin is refused on a cancelled session, and before the scheduled start", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const future = await makeSession(tx, f.a, { state: "published", startsInMinutes: 60, endsInMinutes: 120 });
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.mark_checked_in_manually($1, $2, $3)`, [future, f.a.members[0].memberId, "سبب"]))).toMatch(/not_open/);
    });
  });

  it("a moderator is REFUSED past the code family's 2h ceiling — REQ-CHK-008's original, narrower scope", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeSession(tx, f.a, { state: "completed", startsInMinutes: -300, endsInMinutes: -130 }); // ended 2h10m ago
      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => tx.q(`select * from public.mark_checked_in_manually($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "سبب"]))).toMatch(/not_open/);
    });
  });

  it("a moderator succeeds inside the code family's own window", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await tx.as(f.a.mod.claims);
      const [ci] = await tx.q<{ method: string }>(`select * from public.mark_checked_in_manually($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "نسي الهاتف"]);
      expect(ci.method).toBe("manual");
    });
  });
});

describe("RPC-mark_checked_in_manually.award_points", () => {
  it("enqueues exactly one award_points job, keyed pts:check_in:<id> — the same key shape a code check-in uses", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await tx.as(f.a.mod.claims);
      const [ci] = await tx.q<{ id: string }>(`select * from public.mark_checked_in_manually($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "نسي الهاتف"]);

      await tx.asOwner();
      const jobs = await tx.q<{ task_identifier: string; payload: { rule: string; source: string; source_id: string } }>(
        `select t.identifier as task_identifier, j.payload
           from graphile_worker._private_jobs j
           join graphile_worker._private_tasks t on t.id = j.task_id
          where j.key = $1`,
        [`pts:check_in:${ci.id}`],
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("award_points");
      expect(jobs[0].payload).toMatchObject({ rule: "check_in", source: "check_in", source_id: ci.id });
    });
  });
});
