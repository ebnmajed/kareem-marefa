// supabase/proposed/scoring/0007_award_at_completion.sql — REQ-PTS-015,
// DEC-172, DEC-174: every attendance award a session earns is paid when the
// session completes, and never before, whatever the number of days.
//
// ★ NO BRANCH ON THE NUMBER OF DAYS, so the timing cases run the same
// assertions at one day and at three.
//
// 03 §8.2 rows proven here: POL-check_in.no_award_before_completion,
// RPC-award_points.waits_for_completion_at_any_n,
// RPC-evaluate_member_attendance.pays_only_after_completion,
// RPC-attendance_removed.before_completion_writes_nothing,
// RPC-attendance_removed.no_show_after_completion_only,
// RPC-award_points.presenter_earns_no_attendance,
// RPC-session_award_state.agrees_with_award_points,
// RPC-award_points.legacy_award_standing,
// RPC-evaluate_member_attendance.readd_repays_presenter_bonus.
//
// members[1] throughout for the attendee (fixture-m4 seeds members[0] a ledger
// row). Every day is 10 or more days out, or starts 10 minutes ago on a
// session built for a code check-in — award-points.test.ts's own shape.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  for (const file of ["0006_session_award_state", "0007_award_at_completion", "0008_presenter_awards", "0009_counting_completed"]) {
    await applyProposed(tx, `scoring/${file}.sql`);
  }
  await tx.asOwner();
  return f;
}

/** A session with days at the given offsets (days from now); the first is the
 *  session's own. `live` makes a one-day session that started 10 minutes ago,
 *  so a code check-in is inside its window. */
async function makeSession(tx: Tx, org: Org, state: string, dayOffsets: number[] | "live"): Promise<{ id: string; dayIds: string[] }> {
  await tx.asOwner();
  const live = dayOffsets === "live";
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'جلسة توقيت النقاط', 'ملخص', $2, 'introductory',
             $4::timestamptz, 60, $4::timestamptz + interval '1 hour',
             $3, 40, $5::public.session_state, now() - interval '100 days',
             case when $5 in ('completed','archived') then now() - interval '1 hour' end, true)
     returning id`,
    [
      org.id,
      org.categoryId,
      org.venueId,
      live ? new Date(Date.now() - 10 * 60_000).toISOString() : new Date(Date.now() + dayOffsets[0] * 86_400_000).toISOString(),
      state,
    ],
  );
  if (!live) {
    for (const offset of dayOffsets.slice(1)) {
      await tx.q(
        `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
         values ($1, now() + ($2 || ' days')::interval, now() + ($2 || ' days')::interval + interval '1 hour', $3)`,
        [row.id, String(offset), org.venueId],
      );
    }
  }
  const days = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [row.id]);
  return { id: row.id, dayIds: days.map((d) => d.id) };
}

/** A check-in on one day, then the hook — the two calls checkin's RPCs make. */
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

async function complete(tx: Tx, sessionId: string): Promise<void> {
  await tx.asOwner();
  const [row] = await tx.q<{ state: string }>(`select state from public.sessions where id = $1`, [sessionId]);
  if (row.state === "published") await tx.q(`update public.sessions set state = 'in_progress' where id = $1`, [sessionId]);
  await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);
}

type Payload = { rule: string; member_id: string; source: string; source_id: string; session_id: string | null };
async function attendanceJobs(tx: Tx, memberId: string, sessionId: string) {
  await tx.asOwner();
  return tx.q<{ key: string; payload: Payload }>(
    `select j.key, j.payload from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'award_points' and j.payload ->> 'member_id' = $1
        and j.payload ->> 'source' = 'check_in' and j.payload ->> 'session_id' = $2`,
    [memberId, sessionId],
  );
}

/** The completion job's attendance half, then the award jobs it enqueued —
 *  what worker/src/tasks/{evaluate_no_shows,award_points}.ts run. */
async function completionPass(tx: Tx, memberId: string, sessionId: string): Promise<void> {
  await tx.asOwner();
  await tx.q(`select public.evaluate_session_attendance($1)`, [sessionId]);
  const jobs = await attendanceJobs(tx, memberId, sessionId);
  await tx.asServiceRole();
  for (const { payload } of jobs) {
    await tx.q(`select public.award_points($1, $2, $3, $4, $5)`, [payload.rule, payload.member_id, payload.source, payload.source_id, payload.session_id]);
  }
  await tx.asOwner();
}

/** worker/src/tasks/award_presenter_points.ts's SQL, verbatim, minus rating_bonus. */
async function presenterJob(tx: Tx, sessionId: string, presenter: string): Promise<void> {
  await tx.asServiceRole();
  await tx.q(`select public.award_points('session_delivered', $1, 'session_delivered', $2, $2)`, [presenter, sessionId]);
  await tx.asOwner();
  const attendees = await tx.q<{ epoch_check_in: string }>(
    `select distinct public.attendance_epoch_check_in($1, c.member_id) as epoch_check_in
       from public.check_ins c
      where c.session_id = $1 and c.removed_at is null and public.session_attendance_complete($1, c.member_id)`,
    [sessionId],
  );
  await tx.asServiceRole();
  for (const { epoch_check_in } of attendees) {
    await tx.q(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [presenter, epoch_check_in, sessionId]);
  }
  await tx.asOwner();
}

async function ledger(tx: Tx, memberId: string, sessionId: string) {
  await tx.asOwner();
  return tx.q<{ amount: number; source: string; rule_key: string; reason: string; idempotency_key: string }>(
    `select amount, source, rule_key, reason, idempotency_key from public.points_ledger
      where member_id = $1 and session_id = $2 order by occurred_at, id`,
    [memberId, sessionId],
  );
}

async function stateOf(tx: Tx, claims: Parameters<Tx["as"]>[0], sessionId: string): Promise<string> {
  await tx.as(claims);
  const [row] = await tx.q<{ state: string }>(`select state from public.session_award_state($1)`, [sessionId]);
  await tx.asOwner();
  return row.state;
}

describe("POL-check_in.no_award_before_completion", () => {
  it("a code check-in and a manual mark on a running session enqueue no award job", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await makeSession(tx, f.a, "in_progress", "live");
      await tx.asServiceRole();
      const [code] = await tx.q<{ code: string }>(`select * from public.rotate_check_in_code($1)`, [s.id]);
      await tx.as(f.a.members[1].claims);
      const [row] = await tx.q<{ r: { status: string; check_in: { id: string } } }>(`select public.check_in($1, $2) as r`, [s.id, code.code]);
      expect(row.r.status).toBe("ok");
      expect(await attendanceJobs(tx, f.a.members[1].memberId, s.id)).toEqual([]);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.mark_checked_in_manually($1, $2, 'حضر')`, [s.id, f.a.mod.memberId]);
      expect(await attendanceJobs(tx, f.a.mod.memberId, s.id)).toEqual([]);
      expect(await ledger(tx, f.a.members[1].memberId, s.id)).toEqual([]);
    });
  });

  it("at three days the same: every day attended, nothing enqueued until completion", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const s = await makeSession(tx, f.a, "published", [10, 11, 12]);
      for (const d of s.dayIds) await attend(tx, f.a, s.id, d, member);
      expect(await attendanceJobs(tx, member, s.id)).toEqual([]);
    });
  });
});

describe("RPC-award_points.waits_for_completion_at_any_n / RPC-evaluate_member_attendance.pays_only_after_completion", () => {
  for (const days of [[10], [10, 11, 12]]) {
    it(`${days.length} day(s): a direct award and the pass on a running session write nothing; completed, one row under main's key`, async () => {
      await withTx(async (tx) => {
        const f = await ready(tx);
        const member = f.a.members[1].memberId;
        const s = await makeSession(tx, f.a, "published", days);
        const ids: string[] = [];
        for (const d of s.dayIds) ids.push(await attend(tx, f.a, s.id, d, member));
        const epoch = ids[ids.length - 1];

        await tx.asServiceRole();
        await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [member, epoch, s.id]);
        await completionPass(tx, member, s.id);
        expect(await ledger(tx, member, s.id)).toEqual([]);

        await complete(tx, s.id);
        await completionPass(tx, member, s.id);
        const jobs = await attendanceJobs(tx, member, s.id);
        expect(jobs.map((j) => j.key)).toEqual([`pts:check_in:${epoch}`]);
        expect(jobs[0].payload).toEqual({ rule: "check_in", member_id: member, source: "check_in", source_id: epoch, session_id: s.id });
        const rows = await ledger(tx, member, s.id);
        expect(rows.map((r) => [r.amount, r.idempotency_key])).toEqual([[20, `check_in:check_in:${epoch}:${member}:v1`]]);

        // replayed: nothing more
        await completionPass(tx, member, s.id);
        expect(await ledger(tx, member, s.id)).toHaveLength(1);
      });
    });
  }
});

describe("RPC-attendance_removed.before_completion_writes_nothing / .no_show_after_completion_only", () => {
  it("★ D3: check in, removed before completion — no row of any kind; at completion only the no-show", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const s = await makeSession(tx, f.a, "in_progress", "live");
      await tx.asOwner();
      const [rsvp] = await tx.q<{ id: string }>(
        `insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed') returning id`,
        [f.a.id, s.id, member],
      );
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.mark_checked_in_manually($1, $2, 'حضر')`, [s.id, member]);
      await tx.q(`select * from public.remove_check_in($1, $2, 'سُجّل خطأً')`, [s.id, member]);
      expect(await ledger(tx, member, s.id)).toEqual([]);

      await complete(tx, s.id);
      await completionPass(tx, member, s.id);
      // The no-show half of the completion job, as evaluate_no_shows.ts runs it.
      await tx.asServiceRole();
      await tx.q(`select public.award_points('no_show', $1, 'no_show', $2, $3)`, [member, rsvp.id, s.id]);
      const rows = await ledger(tx, member, s.id);
      expect(rows.map((r) => [r.source, r.amount, r.idempotency_key])).toEqual([["no_show", 0, `no_show:no_show:${rsvp.id}:${member}:v1`]]);
    });
  });

  // Also the after-completion half of tests/rls/checkin-days.test.ts:505–509, whose reversal
  // assertion reads no rows before completion since wave 12 (DEC-174): the key's shape, proven.
  it("after completion a removal reverses under reversal:<id>:v1 and records the no-show under the same key", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const s = await makeSession(tx, f.a, "completed", [10]);
      await tx.asOwner();
      const [rsvp] = await tx.q<{ id: string }>(
        `insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed') returning id`,
        [f.a.id, s.id, member],
      );
      await attend(tx, f.a, s.id, s.dayIds[0], member);
      await completionPass(tx, member, s.id);
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, 'سُجّل خطأً')`, [s.id, member]);
      const rows = await ledger(tx, member, s.id);
      expect(rows.map((r) => r.source)).toEqual(["check_in", "reversal", "no_show"]);
      await tx.asOwner();
      const [award] = await tx.q<{ id: string }>(`select id from public.points_ledger where member_id = $1 and session_id = $2 and source = 'check_in'`, [member, s.id]);
      expect(rows[1].idempotency_key).toBe(`reversal:${award.id}:v1`);
      expect(rows[1].reason).toBe("أُلغي تسجيل الحضور");
      expect(rows[2].idempotency_key).toBe(`no_show:no_show:${rsvp.id}:${member}:v1`);
    });
  });
});

describe("RPC-award_points.presenter_earns_no_attendance / RPC-session_award_state.agrees_with_award_points", () => {
  it("a member checked in and then made an accepted presenter is paid no attendance — and reads none, not pending", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      const s = await makeSession(tx, f.a, "published", [10]);
      await attend(tx, f.a, s.id, s.dayIds[0], member.memberId);
      expect(await stateOf(tx, member.claims, s.id)).toBe("pending");

      // The route sessions' add refuses, and a direct insert under p2_admin_insert does not.
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s.id, member.memberId]);
      expect(await stateOf(tx, member.claims, s.id)).toBe("none");

      await complete(tx, s.id);
      await completionPass(tx, member.memberId, s.id);
      expect((await ledger(tx, member.memberId, s.id)).filter((r) => r.source === "check_in")).toEqual([]);
    });
  });

  it("across the states: pending exactly when the completion pass writes the award", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1];
      const cases: { days: number[]; attendDays: number; expect: string; pays: boolean }[] = [
        { days: [10], attendDays: 1, expect: "pending", pays: true },
        { days: [20, 21, 22], attendDays: 3, expect: "pending", pays: true },
        { days: [30, 31, 32], attendDays: 1, expect: "incomplete", pays: false },
        { days: [40], attendDays: 0, expect: "none", pays: false },
      ];
      for (const c of cases) {
        const s = await makeSession(tx, f.a, "published", c.days);
        for (const d of s.dayIds.slice(0, c.attendDays)) await attend(tx, f.a, s.id, d, member.memberId);
        await complete(tx, s.id);
        expect(await stateOf(tx, member.claims, s.id), `${c.days.length}d, ${c.attendDays} attended`).toBe(c.expect);
        await completionPass(tx, member.memberId, s.id);
        const paid = (await ledger(tx, member.memberId, s.id)).some((r) => r.source === "check_in");
        expect(paid, `${c.days.length}d, ${c.attendDays} attended`).toBe(c.pays);
        expect(await stateOf(tx, member.claims, s.id)).toBe(c.pays ? "paid" : c.expect);
      }
    });
  });
});

describe("RPC-award_points.legacy_award_standing", () => {
  it("a one-day award paid at check-in before DEC-172 stands: completion writes nothing more, a removal before completion reverses it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const s = await makeSession(tx, f.a, "published", [10]);
      const ci = await attend(tx, f.a, s.id, s.dayIds[0], member);
      await tx.asOwner();
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key)
         values ($1, $2, 20, 'check_in', $3, $4, 'تسجيل حضور مؤكَّد', 'check_in', 1, $5)`,
        [f.a.id, member, ci, s.id, `check_in:check_in:${ci}:${member}:v1`],
      );
      await complete(tx, s.id);
      await completionPass(tx, member, s.id);
      expect(await ledger(tx, member, s.id)).toHaveLength(1);

      const other = await makeSession(tx, f.a, "published", [20]);
      const ci2 = await attend(tx, f.a, other.id, other.dayIds[0], member);
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key)
         values ($1, $2, 20, 'check_in', $3, $4, 'تسجيل حضور مؤكَّد', 'check_in', 1, $5)`,
        [f.a.id, member, ci2, other.id, `check_in:check_in:${ci2}:${member}:v1`],
      );
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [ci2, f.a.admin.memberId]);
      await tx.q(`select public.attendance_removed($1)`, [ci2]);
      expect((await ledger(tx, member, other.id)).map((r) => [r.source, r.amount, r.reason])).toEqual([
        ["check_in", 20, "تسجيل حضور مؤكَّد"],
        ["reversal", -20, "أُلغي تسجيل الحضور"],
      ]);
    });
  });
});

describe("RPC-evaluate_member_attendance.readd_repays_presenter_bonus", () => {
  it("DEC-174 ruling 9: an attendee removed and re-added after completion re-earns the presenter's bonus", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const attendee = f.a.members[1].memberId;
      const presenter = f.a.mod.memberId;
      // In the past, because an admin's manual mark needs the scheduled start behind it.
      const s = await makeSession(tx, f.a, "published", [-60]);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s.id, presenter]);
      const ci = await attend(tx, f.a, s.id, s.dayIds[0], attendee);
      await complete(tx, s.id);
      await completionPass(tx, attendee, s.id);
      await presenterJob(tx, s.id, presenter);
      const bonus = async () =>
        (await ledger(tx, presenter, s.id)).filter((r) => r.rule_key === "attendee_bonus").map((r) => [r.amount, r.idempotency_key]);
      expect(await bonus()).toEqual([[2, `attendee_bonus:attendee_bonus:${ci}:${presenter}:v1`]]);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, 'سُجّل خطأً')`, [s.id, attendee]);
      expect((await bonus()).map(([a]) => a)).toEqual([2, -2]);

      // Re-added: the presenters' own job is enqueued under its existing key…
      await tx.as(f.a.admin.claims);
      const [again] = await tx.q<{ id: string }>(`select * from public.mark_checked_in_manually($1, $2, 'حضر')`, [s.id, attendee]);
      await tx.asOwner();
      const jobs = await tx.q(`select id from graphile_worker._private_jobs where key = $1`, [`pts:presenter:${s.id}:${presenter}`]);
      expect(jobs).toHaveLength(1);
      // …and running it pays the bonus again, keyed to the new check-in.
      await completionPass(tx, attendee, s.id);
      await presenterJob(tx, s.id, presenter);
      const rows = await bonus();
      expect(rows.map(([a]) => a)).toEqual([2, -2, 2]);
      expect(rows[2][1]).toBe(`attendee_bonus:attendee_bonus:${again.id}:${presenter}:v1`);
    });
  });
});
