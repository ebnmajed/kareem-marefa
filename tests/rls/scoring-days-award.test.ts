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

const HOOKS = "scoring/0001_attendance_hooks.sql";

/** Seed, then apply the proposed file inside this test's own rolled-back
 *  transaction (DEC-040). Leaves the session as the owner, like applyProposed. */
async function ready(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, HOOKS);
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
