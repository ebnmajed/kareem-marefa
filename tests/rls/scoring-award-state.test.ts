// supabase/proposed/scoring/0006_session_award_state.sql — contract 1 of wave
// 12 (REQ-CHK-018, REQ-PTS-015, DEC-172, DEC-174): the caller's pending
// attendance award, computed and never stored.
//
// 03 §8.2 rows proven here: RPC-session_award_state.caller_only, .none,
// .pending_before_completion, .paid_when_standing, .incomplete,
// .writes_nothing, RPC-attendance_award_barred.service_role_only.
// `.agrees_with_award_points` needs 0007's award_points() and is proven in
// tests/rls/scoring-completion-timing.test.ts.
//
// members[1] throughout, never members[0]: fixture-m4.ts seeds a `check_in`
// ledger row for every org's members[0], which would read as `paid`.
// Every day here is 10 or more days away from today, or 40 or more days in
// the past, clear of the fixture's own sessions and REQ-CHK-013's overlap
// exclusion (the trap written down in docs/plan/notes/scoring.md, wave 9).
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, "scoring/0006_session_award_state.sql");
  await tx.asOwner();
  return f;
}

/** A session whose days start at the given offsets, in days from now. The
 *  first day is the session's own (0100's sessions_sync_single_day()); the
 *  rest are inserted and ranked by session_days_derive(). */
async function makeSession(tx: Tx, org: Org, state: string, dayOffsets: number[]): Promise<{ id: string; dayIds: string[] }> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'جلسة حالة النقاط', 'ملخص', $2, 'introductory',
             now() + ($4 || ' days')::interval, 60, now() + ($4 || ' days')::interval + interval '1 hour',
             $3, 40, $5::public.session_state,
             case when $5 in ('published','in_progress','completed','archived') then now() - interval '100 days' end,
             case when $5 in ('completed','archived') then now() - interval '1 hour' end,
             true)
     returning id`,
    [org.id, org.categoryId, org.venueId, String(dayOffsets[0]), state],
  );
  for (const offset of dayOffsets.slice(1)) {
    await tx.q(
      `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
       values ($1, now() + ($2 || ' days')::interval, now() + ($2 || ' days')::interval + interval '1 hour', $3)`,
      [row.id, String(offset), org.venueId],
    );
  }
  const days = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [row.id]);
  expect(days).toHaveLength(dayOffsets.length);
  return { id: row.id, dayIds: days.map((d) => d.id) };
}

/** A check-in row on one day, written directly — this file measures the read,
 *  not check_in()'s gates. */
async function attend(tx: Tx, org: Org, sessionId: string, dayId: string, memberId: string): Promise<string> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
     values ($1, $2, $3, $4, 'manual', 'حضر', $5) returning id`,
    [org.id, sessionId, dayId, memberId, org.admin.memberId],
  );
  return row.id;
}

type StateRow = { state: string; points: number; days_attended: number; days_required: number; day_count: number; missed_days: { position: number; starts_at: string }[] };

async function stateAs(tx: Tx, claims: Parameters<Tx["as"]>[0], sessionId: string): Promise<StateRow[]> {
  await tx.as(claims);
  const rows = await tx.q<StateRow>(`select * from public.session_award_state($1)`, [sessionId]);
  await tx.asOwner();
  return rows;
}

describe("RPC-session_award_state.caller_only / RPC-attendance_award_barred.service_role_only", () => {
  it("anon cannot call it; another org's member gets zero rows; the presenter bar is service_role only", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await makeSession(tx, f.a, "in_progress", [10]);
      await attend(tx, f.a, s.id, s.dayIds[0], f.a.members[1].memberId);

      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.session_award_state($1)`, [s.id]))).toBe(PERMISSION_DENIED);

      expect(await stateAs(tx, f.b.members[0].claims, s.id)).toEqual([]);
      // A session that does not exist reads exactly the same.
      const ghost = (await tx.q<{ id: string }>(`select gen_random_uuid() as id`))[0].id;
      expect(await stateAs(tx, f.a.members[1].claims, ghost)).toEqual([]);

      for (const claims of [f.a.members[1].claims, f.a.admin.claims]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select public.attendance_award_barred($1, $2)`, [s.id, f.a.members[1].memberId]))).toBe(PERMISSION_DENIED);
      }
      await tx.asServiceRole();
      await tx.q(`select public.attendance_award_barred($1, $2)`, [s.id, f.a.members[1].memberId]); // does not throw
    });
  });
});

describe("RPC-session_award_state.none", () => {
  it("no check-in, a removed check-in, a disabled rule, a cancelled session and an accepted presenter each read none", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      const s = await makeSession(tx, f.a, "in_progress", [10]);

      expect((await stateAs(tx, member.claims, s.id))[0]).toMatchObject({ state: "none", points: 0 });

      const ci = await attend(tx, f.a, s.id, s.dayIds[0], member.memberId);
      expect((await stateAs(tx, member.claims, s.id))[0].state).toBe("pending");

      await tx.q(`update public.scoring_rules set enabled = false where org_id = $1 and action_key = 'check_in'`, [f.a.id]);
      expect((await stateAs(tx, member.claims, s.id))[0].state).toBe("none");
      await tx.q(`update public.scoring_rules set enabled = true where org_id = $1 and action_key = 'check_in'`, [f.a.id]);

      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s.id, member.memberId]);
      expect((await stateAs(tx, member.claims, s.id))[0].state).toBe("none");
      await tx.q(`delete from public.session_presenters where session_id = $1 and member_id = $2`, [s.id, member.memberId]);
      expect((await stateAs(tx, member.claims, s.id))[0].state).toBe("pending");

      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [ci, f.a.admin.memberId]);
      expect((await stateAs(tx, member.claims, s.id))[0]).toMatchObject({ state: "none", days_attended: 0 });

      const cancelled = await makeSession(tx, f.a, "published", [20]);
      await attend(tx, f.a, cancelled.id, cancelled.dayIds[0], member.memberId);
      await tx.q(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'اختبار' where id = $1`, [cancelled.id]);
      expect((await stateAs(tx, member.claims, cancelled.id))[0].state).toBe("none");
    });
  });
});

describe("RPC-session_award_state.pending_before_completion", () => {
  it("one day: the rule's points, one of one", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      const s = await makeSession(tx, f.a, "in_progress", [10]);
      await attend(tx, f.a, s.id, s.dayIds[0], member.memberId);
      expect(await stateAs(tx, member.claims, s.id)).toEqual([
        { state: "pending", points: 20, days_attended: 1, days_required: 1, day_count: 1, missed_days: [] },
      ]);

      // The amount is the rule as it stands — what award_points() will write.
      await tx.q(`update public.scoring_rules set points = 25 where org_id = $1 and action_key = 'check_in'`, [f.a.id]);
      expect((await stateAs(tx, member.claims, s.id))[0].points).toBe(25);
    });
  });

  it("three days: the days attended and required; a relaxed session requires one", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      const s = await makeSession(tx, f.a, "published", [10, 11, 12]);
      await attend(tx, f.a, s.id, s.dayIds[0], member.memberId);
      expect(await stateAs(tx, member.claims, s.id)).toEqual([
        { state: "pending", points: 20, days_attended: 1, days_required: 3, day_count: 3, missed_days: [] },
      ]);

      await tx.q(`update public.sessions set require_all_days = false where id = $1`, [s.id]);
      expect((await stateAs(tx, member.claims, s.id))[0]).toMatchObject({ state: "pending", days_attended: 1, days_required: 1, day_count: 3 });
    });
  });

  it("a completed session whose award has not been written yet is still pending", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      const s = await makeSession(tx, f.a, "completed", [10]);
      await attend(tx, f.a, s.id, s.dayIds[0], member.memberId);
      expect((await stateAs(tx, member.claims, s.id))[0]).toMatchObject({ state: "pending", points: 20 });
    });
  });
});

describe("RPC-session_award_state.paid_when_standing", () => {
  it("an award no reversal names is paid — even on a running session, as one paid at check-in before DEC-172 is; reversed, it is not", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      const s = await makeSession(tx, f.a, "in_progress", [10]);
      const ci = await attend(tx, f.a, s.id, s.dayIds[0], member.memberId);

      // What a pre-migration check-in left: the award, written at the time.
      const [award] = await tx.q<{ id: string }>(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key)
         values ($1, $2, 20, 'check_in', $3, $4, 'تسجيل حضور مؤكَّد', 'check_in', 1, $5) returning id`,
        [f.a.id, member.memberId, ci, s.id, `check_in:check_in:${ci}:${member.memberId}:v1`],
      );
      expect(await stateAs(tx, member.claims, s.id)).toEqual([
        { state: "paid", points: 20, days_attended: 1, days_required: 1, day_count: 1, missed_days: [] },
      ]);

      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
         values ($1, $2, -20, 'reversal', $3, $4, 'أُلغي تسجيل الحضور', 'check_in', $5)`,
        [f.a.id, member.memberId, award.id, s.id, `reversal:${award.id}:v1`],
      );
      expect((await stateAs(tx, member.claims, s.id))[0].state).toBe("pending");
    });
  });
});

describe("RPC-session_award_state.incomplete", () => {
  it("after completion with a day missed: incomplete, naming the missed days in order", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      const s = await makeSession(tx, f.a, "completed", [10, 11, 12]);
      await attend(tx, f.a, s.id, s.dayIds[0], member.memberId);
      await tx.asOwner();
      const days = await tx.q<{ position: number; starts_at: string }>(
        `select position, starts_at from public.session_days where session_id = $1 order by position`,
        [s.id],
      );

      const [row] = await stateAs(tx, member.claims, s.id);
      expect(row).toMatchObject({ state: "incomplete", points: 0, days_attended: 1, days_required: 3, day_count: 3 });
      expect(row.missed_days.map((d) => d.position)).toEqual([2, 3]);
      expect(row.missed_days.map((d) => new Date(d.starts_at).getTime())).toEqual(
        days.slice(1).map((d) => new Date(d.starts_at).getTime()),
      );
    });
  });

  it("before completion, once a required day's ceiling has passed unattended — and pending again if an admin marks that day", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      // Day one 40 days ago, its ceiling long gone; day two still ahead.
      const s = await makeSession(tx, f.a, "in_progress", [-40, 10]);
      await attend(tx, f.a, s.id, s.dayIds[1], member.memberId);

      const [row] = await stateAs(tx, member.claims, s.id);
      expect(row).toMatchObject({ state: "incomplete", days_attended: 1, days_required: 2 });
      expect(row.missed_days.map((d) => d.position)).toEqual([1]);

      // A day whose ceiling has NOT passed is not «missed» yet.
      const ahead = await makeSession(tx, f.a, "published", [20, 21]);
      await attend(tx, f.a, ahead.id, ahead.dayIds[0], member.memberId);
      expect((await stateAs(tx, member.claims, ahead.id))[0].state).toBe("pending");

      // REQ-CHK-017: an admin may mark day one after the fact — the state follows the data.
      await attend(tx, f.a, s.id, s.dayIds[0], member.memberId);
      expect((await stateAs(tx, member.claims, s.id))[0]).toMatchObject({ state: "pending", days_attended: 2 });

      // A relaxed session never reads incomplete before completion: any day is enough.
      const relaxed = await makeSession(tx, f.a, "in_progress", [-50, 30]);
      await tx.q(`update public.sessions set require_all_days = false where id = $1`, [relaxed.id]);
      await attend(tx, f.a, relaxed.id, relaxed.dayIds[1], member.memberId);
      expect((await stateAs(tx, member.claims, relaxed.id))[0].state).toBe("pending");
    });
  });
});

describe("RPC-session_award_state.writes_nothing", () => {
  it("the ledger and the queue are identical before and after every state", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      const s = await makeSession(tx, f.a, "completed", [10, 11]);
      await attend(tx, f.a, s.id, s.dayIds[0], member.memberId);

      const snapshot = async () => {
        await tx.asOwner();
        const [row] = await tx.q<{ ledger: string; jobs: string }>(
          `select (select count(*) from public.points_ledger)::text as ledger,
                  (select count(*) from graphile_worker._private_jobs)::text as jobs`,
        );
        return row;
      };
      const before = await snapshot();
      await stateAs(tx, member.claims, s.id);
      await stateAs(tx, f.a.admin.claims, s.id);
      expect(await snapshot()).toEqual(before);
    });
  });
});
