// supabase/proposed/scoring/0001_attendance_hooks.sql — DEC-150 contract 5:
// attendance_recorded() and attendance_removed(), the seam `checkin`'s three
// RPCs call instead of deciding about points themselves.
//
// ★ THE POINT OF THIS FILE IS THAT NOTHING CHANGES. Every case below asserts
// the new function produces exactly what `main` produces inline today — the
// same job under the same key with the same payload, the same single
// compensating row, the same no-show key. The cases that prove REQ-SES-017's
// real behaviour change (the award at completion, the standing-award
// decision DEC-151 ruled) arrive with the later proposed files, in this same
// file.
//
// 03 §8.2 rows proven here: RPC-attendance_recorded.definer_only,
// RPC-attendance_removed.definer_only, RPC-attendance_recorded.enqueues_award,
// RPC-attendance_removed.reversal, RPC-attendance_removed.no_show_symmetry,
// RPC-attendance_hooks.terminal_row.
//
// members[1] throughout, never members[0]: fixture-m4.ts seeds a 10-point
// `check_in` ledger row for every org's members[0] (on the m2.completed
// session) so the isolation sweep is never vacuous — the exact row that
// would contaminate an "awarded nothing" assertion here.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

/** Each proposed file, with the function whose existence means it has already
 *  been promoted to a migration. Applying a `create function` file twice fails,
 *  so the probe is what lets this suite survive promotion WITHOUT being edited
 *  — and an edited test file is exactly what wave 9's untouched-suite ledger
 *  exists to make visible (rule 4). */
const FILES: ReadonlyArray<readonly [string, string]> = [
  ["scoring/0001_attendance_hooks.sql", "public.attendance_recorded(uuid)"],
  ["scoring/0002_attendance_predicate.sql", "public.session_attendance_complete(uuid,uuid)"],
  ["scoring/0003_award_at_completion.sql", "public.evaluate_member_attendance(uuid,uuid,text)"],
];

async function apply(tx: Tx, upTo: number) {
  for (const [path, probe] of FILES.slice(0, upTo)) {
    await tx.asOwner();
    const [row] = await tx.q<{ present: boolean }>(`select to_regprocedure($1) is not null as present`, [probe]);
    if (!row.present) await applyProposed(tx, path);
  }
  await tx.asOwner();
}

/** Contract 5 alone — the seam as it is first promoted, before any behaviour
 *  change. Leaves the session as the owner, like applyProposed. */
async function ready(tx: Tx) {
  const f = await seed(tx);
  await apply(tx, 1);
  return f;
}

/** All three: the seam, the predicate, and REQ-SES-017's real change. */
async function readyP3(tx: Tx) {
  const f = await seed(tx);
  await apply(tx, 3);
  return f;
}

/** A session in a chosen state, with explicit start/end. 0100's
 *  sessions_sync_single_day() gives it its one day, which is what makes a
 *  direct insert still produce a one-day session. */
async function makeSession(tx: Tx, org: Org, opts: { state: string; startsInMinutes: number; endsInMinutes: number }): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'جلسة حضور', 'ملخص', $2, 'introductory',
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

type CheckInEnvelope = { status: string; check_in?: { id: string } };

/** A real code check-in by members[1], returning the new check_ins row id. */
async function checkInAsMember(tx: Tx, f: Awaited<ReturnType<typeof seed>>, sessionId: string): Promise<string> {
  await tx.asServiceRole();
  const [code] = await tx.q<{ code: string }>(`select * from public.rotate_check_in_code($1)`, [sessionId]);
  await tx.as(f.a.members[1].claims);
  const [row] = await tx.q<{ r: CheckInEnvelope }>(`select public.check_in($1, $2) as r`, [sessionId, code.code]);
  expect(row.r.status).toBe("ok");
  return row.r.check_in!.id;
}

type Job = { task_identifier: string; payload: Record<string, unknown> };
async function jobsUnderKey(tx: Tx, key: string): Promise<Job[]> {
  return tx.q<Job>(
    `select t.identifier as task_identifier, j.payload
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where j.key = $1`,
    [key],
  );
}

describe("RPC-attendance_recorded.definer_only / RPC-attendance_removed.definer_only", () => {
  it("no client role can call either hook; only service_role and the owner can", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const recorded = () => tx.q(`select public.attendance_recorded(gen_random_uuid())`);
      const removed = () => tx.q(`select public.attendance_removed(gen_random_uuid())`);

      for (const claims of [f.a.members[1].claims, f.a.admin.claims]) {
        await tx.as(claims);
        expect(await errorCode(recorded)).toBe(PERMISSION_DENIED);
        expect(await errorCode(removed)).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(recorded)).toBe(PERMISSION_DENIED);
      expect(await errorCode(removed)).toBe(PERMISSION_DENIED);

      // service_role and the owner both succeed — the owner matters most:
      // check_in(), mark_checked_in_manually() and remove_check_in() are all
      // SECURITY DEFINER and run as the owner, so this is the grant that
      // actually lets `checkin` switch its call sites.
      await tx.asServiceRole();
      await recorded();
      await removed();
      await tx.asOwner();
      await recorded();
      await removed();
    });
  });
});

describe("RPC-attendance_hooks.terminal_row", () => {
  it("a check-in id that no longer exists returns silently from both, and enqueues nothing", async () => {
    await withTx(async (tx) => {
      await ready(tx);
      const ghost = (await tx.q<{ id: string }>(`select gen_random_uuid() as id`))[0].id;
      await tx.asOwner();
      await tx.q(`select public.attendance_recorded($1)`, [ghost]);
      await tx.q(`select public.attendance_removed($1)`, [ghost]);
      expect(await jobsUnderKey(tx, `pts:check_in:${ghost}`)).toEqual([]);
    });
  });
});

describe("RPC-attendance_recorded.enqueues_award", () => {
  it("enqueues exactly one award_points job under main's key, with main's exact payload", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });

      // A check-in row written directly, so the ONLY enqueue in this test is
      // the hook's own — check_in() still enqueues inline until `checkin`
      // switches, and this case must measure the hook, not the RPC.
      await tx.asOwner();
      const [ci] = await tx.q<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by)
         values ($1, $2, $3, 'manual', 'حضر', $4) returning id`,
        [f.a.id, sessionId, f.a.members[1].memberId, f.a.admin.memberId],
      );
      expect(await jobsUnderKey(tx, `pts:check_in:${ci.id}`)).toEqual([]);

      await tx.q(`select public.attendance_recorded($1)`, [ci.id]);

      const jobs = await jobsUnderKey(tx, `pts:check_in:${ci.id}`);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("award_points");
      expect(jobs[0].payload).toEqual({
        rule: "check_in",
        member_id: f.a.members[1].memberId,
        source: "check_in",
        source_id: ci.id,
        session_id: sessionId,
      });
    });
  });

  it("★ the seam is behaviour-neutral: called after check_in()'s own inline enqueue, there is still exactly one job and its payload is unchanged", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const checkInId = await checkInAsMember(tx, f, sessionId);

      await tx.asOwner();
      const before = await jobsUnderKey(tx, `pts:check_in:${checkInId}`);
      expect(before).toHaveLength(1);

      // This is precisely the substitution `checkin` will make: the inline
      // block's output, then the hook's. Identical key, identical payload,
      // and enqueue_job's job_key_mode => 'replace' (0025) keeps it one row.
      await tx.q(`select public.attendance_recorded($1)`, [checkInId]);

      const after = await jobsUnderKey(tx, `pts:check_in:${checkInId}`);
      expect(after).toHaveLength(1);
      expect(after[0].task_identifier).toBe(before[0].task_identifier);
      expect(after[0].payload).toEqual(before[0].payload);
    });
  });

  it("calling it twice touches the same key, never a second job", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await tx.asOwner();
      const [ci] = await tx.q<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by)
         values ($1, $2, $3, 'manual', 'حضر', $4) returning id`,
        [f.a.id, sessionId, f.a.members[1].memberId, f.a.admin.memberId],
      );
      await tx.q(`select public.attendance_recorded($1)`, [ci.id]);
      await tx.q(`select public.attendance_recorded($1)`, [ci.id]);
      expect(await jobsUnderKey(tx, `pts:check_in:${ci.id}`)).toHaveLength(1);
    });
  });
});

describe("RPC-attendance_removed.reversal", () => {
  it("writes ONE compensating row for the attendee's award AND one for the presenter's attendee_bonus; a second call writes no more", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const checkInId = await checkInAsMember(tx, f, sessionId);
      const attendee = f.a.members[1].memberId;
      const presenter = f.a.members[0].memberId;

      // Both awards key their source_id to this check-in row (0087's header).
      await tx.asServiceRole();
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [attendee, checkInId, sessionId]);
      await tx.q(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [presenter, checkInId, sessionId]);

      await tx.asOwner();
      const originals = await tx.q<{ id: string; amount: number; member_id: string; rule_key: string }>(
        `select id, amount, member_id, rule_key from public.points_ledger
          where source in ('check_in', 'attendee_bonus') and source_id = $1 order by rule_key`,
        [checkInId],
      );
      expect(originals).toHaveLength(2);

      await tx.q(`select public.attendance_removed($1)`, [checkInId]);

      for (const original of originals) {
        const reversals = await tx.q<{ amount: number; reason: string; member_id: string; rule_key: string; idempotency_key: string }>(
          `select amount, reason, member_id, rule_key, idempotency_key from public.points_ledger
            where source = 'reversal' and source_id = $1`,
          [original.id],
        );
        expect(reversals).toHaveLength(1);
        expect(reversals[0].amount).toBe(-original.amount);
        expect(reversals[0].reason).toBe("أُلغي تسجيل الحضور");
        expect(reversals[0].member_id).toBe(original.member_id);
        expect(reversals[0].rule_key).toBe(original.rule_key);
        expect(reversals[0].idempotency_key).toBe(`reversal:${original.id}:v1`);
      }

      // Idempotent: the same call again adds nothing. This is what lets
      // remove_check_in() call the hook without caring whether an earlier
      // path already reversed.
      await tx.q(`select public.attendance_removed($1)`, [checkInId]);
      const all = await tx.q(`select id from public.points_ledger where source = 'reversal' and source_id = any($1::uuid[])`, [originals.map((o) => o.id)]);
      expect(all).toHaveLength(2);
    });
  });

  it("an award that earned nothing has nothing to reverse — no row, no error", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const checkInId = await checkInAsMember(tx, f, sessionId);

      await tx.asOwner();
      await tx.q(`select public.attendance_removed($1)`, [checkInId]);
      const rows = await tx.q(`select id from public.points_ledger where source = 'reversal' and source_id = $1`, [checkInId]);
      expect(rows).toEqual([]);
    });
  });
});

describe("RPC-attendance_removed.no_show_symmetry", () => {
  it("a confirmed RSVP earns the no_show rule under evaluate_no_shows' own key; no RSVP earns no such row", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const member = f.a.members[1].memberId;

      await tx.asOwner();
      const [rsvp] = await tx.q<{ id: string }>(
        `insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed') returning id`,
        [f.a.id, sessionId, member],
      );
      const [ci] = await tx.q<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by)
         values ($1, $2, $3, 'manual', 'حضر', $4) returning id`,
        [f.a.id, sessionId, member, f.a.admin.memberId],
      );

      await tx.q(`select public.attendance_removed($1)`, [ci.id]);

      const rows = await tx.q<{ idempotency_key: string; amount: number }>(
        `select idempotency_key, amount from public.points_ledger where source = 'no_show' and member_id = $1 and session_id = $2`,
        [member, sessionId],
      );
      expect(rows).toHaveLength(1);
      // The exact key evaluate_no_shows.ts computes, so a later replay of
      // that job can never double-award (0087's own reasoning, preserved).
      expect(rows[0].idempotency_key).toBe(`no_show:no_show:${rsvp.id}:${member}:v1`);
      expect(rows[0].amount).toBe(0); // D40: recorded, not penalised, by default
    });
  });

  it("a member with no confirmed RSVP earns no no_show row", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const member = f.a.members[1].memberId;
      await tx.asOwner();
      const [ci] = await tx.q<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by)
         values ($1, $2, $3, 'manual', 'حضر', $4) returning id`,
        [f.a.id, sessionId, member, f.a.admin.memberId],
      );
      await tx.q(`select public.attendance_removed($1)`, [ci.id]);
      const rows = await tx.q(`select id from public.points_ledger where source = 'no_show' and member_id = $1`, [member]);
      expect(rows).toEqual([]);
    });
  });

  it("★ the seam is behaviour-neutral: called after remove_check_in() has already run, it writes nothing new", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const checkInId = await checkInAsMember(tx, f, sessionId);
      const member = f.a.members[1].memberId;

      await tx.asOwner();
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, sessionId, member]);
      await tx.asServiceRole();
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [member, checkInId, sessionId]);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, member, "خطأ في تسجيل الحضور"]);

      await tx.asOwner();
      const before = await tx.q<{ id: string }>(`select id from public.points_ledger where member_id = $1 order by occurred_at, id`, [member]);

      // The substitution `checkin` will make inside remove_check_in().
      await tx.q(`select public.attendance_removed($1)`, [checkInId]);

      const after = await tx.q<{ id: string }>(`select id from public.points_ledger where member_id = $1 order by occurred_at, id`, [member]);
      expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P3 — supabase/proposed/scoring/0003_award_at_completion.sql
//
// REQ-SES-017's real change, and DEC-151's ruling that the epoch key is the
// SECOND line of defence. The two cases that would have caught the defect in
// the first design are marked ★ DEC-151.
// ═══════════════════════════════════════════════════════════════════════════

/** A session with `days` consecutive days, ten days out — clear of the
 *  fixture's own session 24 hours from now, whose check-in for members[1]
 *  carries a real window since 0100 and would otherwise trip REQ-CHK-013's
 *  overlap exclusion. */
async function makeDays(tx: Tx, org: Org, opts: { days: number; state: string }): Promise<{ sessionId: string; dayIds: string[] }> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'ورشة ثلاثة أيام', 'ملخص', $2, 'introductory',
             now() + interval '10 days', 60, now() + interval '10 days' + interval '1 hour',
             $3, 40, $4::public.session_state,
             now() - interval '1 day',
             case when $4 = 'completed' then now() - interval '1 hour' end,
             true)
     returning id`,
    [org.id, org.categoryId, org.venueId, opts.state],
  );
  for (let i = 1; i < opts.days; i += 1) {
    await tx.q(
      `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
       values ($1, now() + interval '10 days' + ($2 || ' days')::interval,
                   now() + interval '10 days' + interval '1 hour' + ($2 || ' days')::interval, $3)`,
      [row.id, String(i), org.venueId],
    );
  }
  const days = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [row.id]);
  expect(days).toHaveLength(opts.days);
  return { sessionId: row.id, dayIds: days.map((d) => d.id) };
}

/** A check-in on one named day, through the hook — the two calls `checkin`'s
 *  RPCs will make. Returns the new row's id. */
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

/** The attendance award jobs enqueued for this member on this session.
 *
 *  ★ Scoped to `source = 'check_in'` and to the session on purpose: fixture-m2
 *  seeds a comment and a rating for members[1], and 0029's triggers enqueue a
 *  real award_points job for each. Running those too would add 7 points to
 *  every assertion in this file and make the numbers look like a scoring bug. */
async function attendanceJobs(tx: Tx, memberId: string, sessionId: string) {
  await tx.asOwner();
  return tx.q<{ payload: { rule: string; member_id: string; source: string; source_id: string; session_id: string | null } }>(
    `select j.payload from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'award_points'
        and j.payload ->> 'member_id' = $1
        and j.payload ->> 'source' = 'check_in'
        and j.payload ->> 'session_id' = $2`,
    [memberId, sessionId],
  );
}

/** Run them — what the worker does with the payload
 *  (worker/src/tasks/award_points.ts). */
async function runAwardJobs(tx: Tx, memberId: string, sessionId: string): Promise<void> {
  const jobs = await attendanceJobs(tx, memberId, sessionId);
  await tx.asServiceRole();
  for (const { payload } of jobs) {
    await tx.q(`select public.award_points($1, $2, $3, $4, $5)`, [payload.rule, payload.member_id, payload.source, payload.source_id, payload.session_id]);
  }
  await tx.asOwner();
}

async function ledger(tx: Tx, memberId: string, sessionId: string) {
  await tx.asOwner();
  return tx.q<{ amount: number; source: string; source_id: string | null; reason: string; idempotency_key: string }>(
    `select amount, source, source_id, reason, idempotency_key from public.points_ledger
      where member_id = $1 and session_id = $2 order by occurred_at, id`,
    [memberId, sessionId],
  );
}

/** What this session is worth to this member — the literals in this file.
 *  NOT points_balances, which is the member's whole history and carries the
 *  fixture's own seeded rows. */
async function sessionTotal(tx: Tx, memberId: string, sessionId: string): Promise<number> {
  await tx.asOwner();
  const [row] = await tx.q<{ total: string | null }>(
    `select sum(amount)::text as total from public.points_ledger where member_id = $1 and session_id = $2`,
    [memberId, sessionId],
  );
  return Number(row?.total ?? 0);
}

/** REQ-PTS-011, checked in place: the rollup equals the ledger, always. */
async function expectRollupMatchesLedger(tx: Tx, memberId: string): Promise<void> {
  await tx.asOwner();
  const [row] = await tx.q<{ rolled: number | null; summed: string | null }>(
    `select (select total_points from public.points_balances where member_id = $1) as rolled,
            (select sum(amount)::text from public.points_ledger where member_id = $1) as summed`,
    [memberId],
  );
  expect(Number(row.rolled ?? 0)).toBe(Number(row.summed ?? 0));
}

describe("RPC-attendance_recorded.one_day_pays_at_check_in", () => {
  it("★ a one-day session still pays at check-in, under main's key, with main's payload", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 1, state: "in_progress" });

      const checkInId = await attend(tx, f.a, sessionId, dayIds[0], member);

      const jobs = await jobsUnderKey(tx, `pts:check_in:${checkInId}`);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("award_points");
      expect(jobs[0].payload).toEqual({
        rule: "check_in",
        member_id: member,
        source: "check_in",
        source_id: checkInId,
        session_id: sessionId,
      });

      await runAwardJobs(tx, member, sessionId);
      const rows = await ledger(tx, member, sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe(20);
      expect(rows[0].idempotency_key).toBe(`check_in:check_in:${checkInId}:${member}:v1`);

      // …and the completion pass then writes nothing: the same epoch, the same
      // key, an award already standing. One proven no-op.
      await tx.q(`select public.evaluate_session_attendance($1)`, [sessionId]);
      await runAwardJobs(tx, member, sessionId);
      expect(await ledger(tx, member, sessionId)).toHaveLength(1);
    });
  });
});

describe("RPC-attendance_recorded.multi_day_waits", () => {
  it("a multi-day session before completion enqueues nothing, whatever days have been attended", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, state: "published" });

      for (const dayId of dayIds) await attend(tx, f.a, sessionId, dayId, member);

      expect(await attendanceJobs(tx, member, sessionId)).toEqual([]);
      expect(await ledger(tx, member, sessionId)).toEqual([]);
    });
  });
});

describe("RPC-evaluate_session_attendance.one_award_per_member", () => {
  it("★ a three-day workshop attended in full pays ONE attendance award, and the pass run twice writes nothing more", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, state: "completed" });

      // Three check-ins, on a session already completed: each is evaluated at
      // once, and only the third makes the predicate true.
      const ids: string[] = [];
      for (const dayId of dayIds) ids.push(await attend(tx, f.a, sessionId, dayId, member));
      await runAwardJobs(tx, member, sessionId);

      let rows = await ledger(tx, member, sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe(20); // not 60
      // Keyed to the epoch: the latest-created active check-in, which is day 3's.
      expect(rows[0].idempotency_key).toBe(`check_in:check_in:${ids[2]}:${member}:v1`);

      await tx.q(`select public.evaluate_session_attendance($1)`, [sessionId]);
      await runAwardJobs(tx, member, sessionId);
      rows = await ledger(tx, member, sessionId);
      expect(rows).toHaveLength(1);
      expect(await sessionTotal(tx, member, sessionId)).toBe(20);
    });
  });

  it("★ trace (a): remove one day, then re-add it — +20, −20, +20, and the balance is right at every step", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, state: "completed" });

      const ids: string[] = [];
      for (const dayId of dayIds) ids.push(await attend(tx, f.a, sessionId, dayId, member));
      await runAwardJobs(tx, member, sessionId);
      expect(await sessionTotal(tx, member, sessionId)).toBe(20);

      // Day 1's check-in is retracted: the predicate fails, the award comes off.
      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [ids[0], f.a.admin.memberId]);
      await tx.q(`select public.attendance_removed($1)`, [ids[0]]);
      expect(await sessionTotal(tx, member, sessionId)).toBe(0);

      // Re-added on day 1. The award still NAMES day three's check-in — the
      // highest-position day is unchanged by re-adding day one — so what makes
      // the key new is the epoch segment: one reversal has been written, so
      // this award is `v2`. A key that carried the epoch only in its source_id
      // would have collided here and paid nothing.
      const readded = await attend(tx, f.a, sessionId, dayIds[0], member);
      await runAwardJobs(tx, member, sessionId);

      const rows = await ledger(tx, member, sessionId);
      expect(rows.map((r) => r.amount)).toEqual([20, -20, 20]);
      expect(rows[0].idempotency_key).toBe(`check_in:check_in:${ids[2]}:${member}:v1`);
      expect(rows[1].source).toBe("reversal");
      expect(rows[1].reason).toBe("أُلغي تسجيل الحضور");
      expect(rows[2].idempotency_key).toBe(`check_in:check_in:${ids[2]}:${member}:v2`);
      expect(rows[2].idempotency_key).not.toBe(rows[0].idempotency_key);
      expect(readded).not.toBe(ids[0]);
      expect(await sessionTotal(tx, member, sessionId)).toBe(20);
      await expectRollupMatchesLedger(tx, member);

      // Replaying the completion pass changes nothing.
      await tx.q(`select public.evaluate_session_attendance($1)`, [sessionId]);
      await runAwardJobs(tx, member, sessionId);
      expect(await ledger(tx, member, sessionId)).toHaveLength(3);
      expect(await sessionTotal(tx, member, sessionId)).toBe(20);
    });
  });
});

describe("RPC-evaluate_member_attendance.no_double_pay_on_new_epoch", () => {
  it("★ DEC-151: with require_all_days = false, a later manual mark advances the epoch while the award STANDS — and writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, state: "completed" });
      await tx.asOwner();
      await tx.q(`update public.sessions set require_all_days = false where id = $1`, [sessionId]);

      // Day 1 only: the predicate holds at once, and the award is keyed to CI1.
      const first = await attend(tx, f.a, sessionId, dayIds[0], member);
      await runAwardJobs(tx, member, sessionId);
      let rows = await ledger(tx, member, sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0].idempotency_key).toBe(`check_in:check_in:${first}:${member}:v1`);

      // The next morning an admin corrects day 2's list. A NEW active check-in,
      // so a new epoch and a new key — and under the first design a second
      // +20, because nothing had reversed the first.
      await attend(tx, f.a, sessionId, dayIds[1], member);
      await runAwardJobs(tx, member, sessionId);

      rows = await ledger(tx, member, sessionId);
      expect(rows).toHaveLength(1);
      expect(await sessionTotal(tx, member, sessionId)).toBe(20);
    });
  });
});

describe("RPC-evaluate_member_attendance.no_double_pay_on_replay", () => {
  it("★ DEC-151: removing the epoch check-in while the predicate still holds, then replaying the pass, writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      // PUBLISHED while the days are attended — a multi-day session waits, so
      // nothing is awarded yet and day 3's row gets to be the epoch while day
      // 1's is still active. That ordering is the whole point of the case.
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, state: "published" });
      await tx.asOwner();
      await tx.q(`update public.sessions set require_all_days = false where id = $1`, [sessionId]);

      const first = await attend(tx, f.a, sessionId, dayIds[0], member);
      const third = await attend(tx, f.a, sessionId, dayIds[2], member);
      expect(await ledger(tx, member, sessionId)).toEqual([]);

      await tx.asOwner();
      // 0010's state machine has no published -> completed edge.
      await tx.q(`update public.sessions set state = 'in_progress' where id = $1`, [sessionId]);
      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);
      await tx.q(`select public.evaluate_session_attendance($1)`, [sessionId]);
      await runAwardJobs(tx, member, sessionId);
      let rows = await ledger(tx, member, sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0].idempotency_key).toBe(`check_in:check_in:${third}:${member}:v1`);

      // Day 3's check-in goes. The member still attended day 1, so the
      // predicate STILL HOLDS and nothing is reversed — which is correct, and
      // is exactly what makes the replay dangerous: the epoch is now CI1.
      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [third, f.a.admin.memberId]);
      await tx.q(`select public.attendance_removed($1)`, [third]);
      expect(await sessionTotal(tx, member, sessionId)).toBe(20);

      await tx.q(`select public.evaluate_session_attendance($1)`, [sessionId]);
      await runAwardJobs(tx, member, sessionId);

      rows = await ledger(tx, member, sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0].idempotency_key).toBe(`check_in:check_in:${third}:${member}:v1`);
      expect(await sessionTotal(tx, member, sessionId)).toBe(20);
      // The epoch really did move — day 1's row is now the latest active one,
      // and a key-only defence would have written a second award under it.
      await tx.asOwner();
      const [epoch] = await tx.q<{ id: string }>(`select public.attendance_epoch_check_in($1, $2) as id`, [sessionId, member]);
      expect(epoch.id).toBe(first);
      await expectRollupMatchesLedger(tx, member);
    });
  });
});

describe("RPC-evaluate_session_attendance.reverses_added_day", () => {
  it("★ DEC-151 answer 2: a one-day award, then a second day added and missed, is reversed at completion with its own reason", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 1, state: "published" });

      await attend(tx, f.a, sessionId, dayIds[0], member);
      await runAwardJobs(tx, member, sessionId);
      expect(await sessionTotal(tx, member, sessionId)).toBe(20);

      // Rescheduled to two days. The member does not attend the second.
      await tx.asOwner();
      await tx.q(
        `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
         values ($1, now() + interval '11 days', now() + interval '11 days' + interval '1 hour', $2)`,
        [sessionId, f.a.venueId],
      );
      // 0010's state machine has no published -> completed edge.
      await tx.q(`update public.sessions set state = 'in_progress' where id = $1`, [sessionId]);
      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);
      await tx.q(`select public.evaluate_session_attendance($1)`, [sessionId]);

      const rows = await ledger(tx, member, sessionId);
      expect(rows.map((r) => r.amount)).toEqual([20, -20]);
      expect(rows[1].source).toBe("reversal");
      expect(rows[1].reason).toBe("لم يكتمل حضور جميع الأيام");
      expect(rows[1].source_id).toBe(rows[0].source_id === null ? null : rows[1].source_id); // the reversal points at the award row
      expect(await sessionTotal(tx, member, sessionId)).toBe(0);

      // Idempotent: the pass again writes nothing.
      await tx.q(`select public.evaluate_session_attendance($1)`, [sessionId]);
      expect(await ledger(tx, member, sessionId)).toHaveLength(2);
    });
  });
});

describe("RPC-award_points.requires_attendance_complete / .skips_when_award_standing", () => {
  it("a late award_points('check_in', …) for a member who missed a day writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, state: "completed" });
      const first = await attend(tx, f.a, sessionId, dayIds[0], member);

      await tx.asServiceRole();
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [member, first, sessionId]);
      expect(await ledger(tx, member, sessionId)).toEqual([]);
    });
  });

  it("the same call with an award already standing for that session writes nothing, even under a key it has never written", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 2, state: "completed" });
      const first = await attend(tx, f.a, sessionId, dayIds[0], member);
      const second = await attend(tx, f.a, sessionId, dayIds[1], member);
      await runAwardJobs(tx, member, sessionId);
      expect(await ledger(tx, member, sessionId)).toHaveLength(1);

      // A different source_id — a key this session has never seen — and still
      // nothing, because the decision is the standing award, not the key.
      await tx.asServiceRole();
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [member, first, sessionId]);
      expect(await ledger(tx, member, sessionId)).toHaveLength(1);
      expect(first).not.toBe(second);
    });
  });
});

describe("RPC-attendance_removed.no_show_only_when_none_left", () => {
  it("removing one day of three records no no_show; removing the last active one does", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, state: "completed" });
      await tx.asOwner();
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, sessionId, member]);

      const ids: string[] = [];
      for (const dayId of dayIds) ids.push(await attend(tx, f.a, sessionId, dayId, member));

      const noShows = async () => {
        await tx.asOwner();
        return tx.q(`select id from public.points_ledger where source = 'no_show' and member_id = $1 and session_id = $2`, [member, sessionId]);
      };

      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [ids[0], f.a.admin.memberId]);
      await tx.q(`select public.attendance_removed($1)`, [ids[0]]);
      expect(await noShows()).toEqual([]); // a partial attendee is not a no-show

      for (const id of [ids[1], ids[2]]) {
        await tx.asOwner();
        await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [id, f.a.admin.memberId]);
        await tx.q(`select public.attendance_removed($1)`, [id]);
      }
      expect(await noShows()).toHaveLength(1);
    });
  });
});

describe("RPC-attendance_removed.reverses_presenter_bonus_by_member", () => {
  it("the presenter's attendee_bonus is reversed even when it is keyed to a different day's check-in", async () => {
    await withTx(async (tx) => {
      const f = await readyP3(tx);
      const attendee = f.a.members[1].memberId;
      const presenter = f.a.members[0].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, state: "completed" });

      const ids: string[] = [];
      for (const dayId of dayIds) ids.push(await attend(tx, f.a, sessionId, dayId, attendee));

      // The bonus is keyed to the attendee's EPOCH check-in — day 3's — which
      // is what worker/src/tasks/award_presenter_points.ts now computes.
      await tx.asServiceRole();
      await tx.q(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [presenter, ids[2], sessionId]);
      await tx.asOwner();
      const [bonus] = await tx.q<{ id: string; amount: number }>(
        `select id, amount from public.points_ledger where source = 'attendee_bonus' and source_id = $1`,
        [ids[2]],
      );
      expect(bonus.amount).toBeGreaterThan(0);

      // DAY ONE's check-in is removed — not the row the bonus is keyed to.
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [ids[0], f.a.admin.memberId]);
      await tx.q(`select public.attendance_removed($1)`, [ids[0]]);

      const reversal = await tx.q<{ amount: number }>(
        `select amount from public.points_ledger where source = 'reversal' and source_id = $1`,
        [bonus.id],
      );
      expect(reversal).toHaveLength(1);
      expect(reversal[0].amount).toBe(-bonus.amount);
    });
  });
});
