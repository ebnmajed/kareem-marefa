// REQ-PTS-011 after multi-day — «rebuilding the rollup reproduces every
// balance exactly», on the hardest history this wave can produce: a three-day
// workshop attended in full, one day retracted, then re-added.
//
// This is the case that would catch a design where the award moved but the
// ledger stopped being a pure left fold. It cannot, and that is the point:
// every movement this wave adds is an INSERT — one award per member per
// session, plus compensating rows — so points_balances stays a trigger-
// maintained sum with nothing to un-apply (`05` §2.3), and
// rebuild_points_balances() reproduces it exactly.
//
// 03 §8.2 rows proven here: RPC-rebuild_points_balances.after_multi_day,
// RPC-audit_balances.silent_after_multi_day.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const FILES: ReadonlyArray<readonly [string, string]> = [
  ["scoring/0001_attendance_hooks.sql", "public.attendance_recorded(uuid)"],
  ["scoring/0002_attendance_predicate.sql", "public.session_attendance_complete(uuid,uuid)"],
  ["scoring/0003_award_at_completion.sql", "public.evaluate_member_attendance(uuid,uuid,text)"],
];

async function ready(tx: Tx) {
  const f = await seed(tx);
  for (const [path, probe] of FILES) {
    await tx.asOwner();
    const [row] = await tx.q<{ present: boolean }>(`select to_regprocedure($1) is not null as present`, [probe]);
    if (!row.present) await applyProposed(tx, path);
  }
  await tx.asOwner();
  return f;
}

async function makeWorkshop(tx: Tx, org: Org, days: number): Promise<{ sessionId: string; dayIds: string[] }> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'ورشة ثلاثة أيام', 'ملخص', $2, 'introductory',
             now() + interval '10 days', 60, now() + interval '10 days' + interval '1 hour',
             $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour', true)
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  for (let i = 1; i < days; i += 1) {
    await tx.q(
      `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
       values ($1, now() + interval '10 days' + ($2 || ' days')::interval,
                   now() + interval '10 days' + interval '1 hour' + ($2 || ' days')::interval, $3)`,
      [row.id, String(i), org.venueId],
    );
  }
  const dayRows = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [row.id]);
  return { sessionId: row.id, dayIds: dayRows.map((d) => d.id) };
}

async function attend(tx: Tx, org: Org, sessionId: string, dayId: string, memberId: string): Promise<string> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
     values ($1, $2, $3, $4, 'manual', 'حضر', $5) returning id`,
    [org.id, sessionId, dayId, memberId, org.admin.memberId],
  );
  await tx.q(`select public.attendance_recorded($1)`, [row.id]);
  return row.id;
}

async function runAwardJobs(tx: Tx, memberId: string, sessionId: string): Promise<void> {
  await tx.asOwner();
  const jobs = await tx.q<{ payload: { rule: string; member_id: string; source: string; source_id: string; session_id: string | null } }>(
    `select j.payload from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'award_points'
        and j.payload ->> 'member_id' = $1
        and j.payload ->> 'source' = 'check_in'
        and j.payload ->> 'session_id' = $2`,
    [memberId, sessionId],
  );
  await tx.asServiceRole();
  for (const { payload } of jobs) {
    await tx.q(`select public.award_points($1, $2, $3, $4, $5)`, [payload.rule, payload.member_id, payload.source, payload.source_id, payload.session_id]);
  }
  await tx.asOwner();
}

describe("RPC-rebuild_points_balances.after_multi_day / RPC-audit_balances.silent_after_multi_day", () => {
  it("★ a three-day workshop with a removal and a re-add: the rollup, the ledger sum and a full rebuild all agree", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeWorkshop(tx, f.a, 3);

      const ids: string[] = [];
      for (const dayId of dayIds) ids.push(await attend(tx, f.a, sessionId, dayId, member));
      await runAwardJobs(tx, member, sessionId);

      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [ids[0], f.a.admin.memberId]);
      await tx.q(`select public.attendance_removed($1)`, [ids[0]]);

      await attend(tx, f.a, sessionId, dayIds[0], member);
      await runAwardJobs(tx, member, sessionId);

      // Three movements on this session, netting one award.
      const rows = await tx.q<{ amount: number }>(
        `select amount from public.points_ledger where member_id = $1 and session_id = $2 order by occurred_at, id`,
        [member, sessionId],
      );
      expect(rows.map((r) => r.amount)).toEqual([20, -20, 20]);

      // The rollup agrees with the ledger before the rebuild…
      const readBoth = async () => {
        await tx.asOwner();
        const [row] = await tx.q<{ rolled: number | null; summed: string | null; last_entry_id: string | null; newest: string | null }>(
          `select (select total_points from public.points_balances where member_id = $1) as rolled,
                  (select sum(amount)::text from public.points_ledger where member_id = $1) as summed,
                  (select last_entry_id from public.points_balances where member_id = $1) as last_entry_id,
                  (select (array_agg(id order by occurred_at desc))[1] from public.points_ledger where member_id = $1) as newest`,
          [member],
        );
        return row;
      };
      const before = await readBoth();
      expect(Number(before.rolled ?? 0)).toBe(Number(before.summed ?? 0));
      expect(before.last_entry_id).toBe(before.newest);

      // …and `05` §4.1's nightly oracle has nothing to report.
      await tx.asServiceRole();
      expect(await tx.q(`select member_id from public.audit_balances()`)).toEqual([]);

      // …and a full rebuild from ledger rows alone reproduces it exactly.
      await tx.q(`select public.rebuild_points_balances()`);
      const after = await readBoth();
      expect(Number(after.rolled ?? 0)).toBe(Number(before.rolled ?? 0));
      expect(after.last_entry_id).toBe(before.last_entry_id);

      await tx.asServiceRole();
      expect(await tx.q(`select member_id from public.audit_balances()`)).toEqual([]);
    });
  });

  it("the ledger is still append-only after all of it — update and delete raise for the owner too", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeWorkshop(tx, f.a, 2);
      for (const dayId of dayIds) await attend(tx, f.a, sessionId, dayId, member);
      await runAwardJobs(tx, member, sessionId);

      await tx.asOwner();
      const [row] = await tx.q<{ id: string }>(
        `select id from public.points_ledger where member_id = $1 and session_id = $2 limit 1`,
        [member, sessionId],
      );
      // invariant 9: not the worker, not the owner, nobody. A reversal is a
      // compensating row — which is the only reason any of this wave's
      // corrections are expressible at all.
      await expect(tx.q(`update public.points_ledger set amount = 0 where id = $1`, [row.id])).rejects.toThrow(/append-only/);
      await expect(tx.q(`delete from public.points_ledger where id = $1`, [row.id])).rejects.toThrow(/append-only/);
    });
  });
});
