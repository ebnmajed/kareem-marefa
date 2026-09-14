// supabase/proposed/scoring/0004_award_presenter_points.sql —
// proposal_accepted and the session-completion fan-out (STORY-PTS-003,
// OQ-004, docs/plan/notes/scoring.md).
//
// 03 §8.2 rows proven here: POL-proposals.award_points_hook,
// POL-sessions.completion_fanout.
//
// The worker tasks themselves (worker/src/tasks/{evaluate_no_shows,
// award_presenter_points}.ts) are thin TypeScript wrappers around SQL that
// IS exercised here — the fan-out is proven at the trigger/enqueue layer,
// and the tasks' own SQL (the no-show query, the rating-average threshold)
// is proven by running the identical statements a worker run would.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed, type Org } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  // Promoted at wave-2 sync 3 (0031–0035): applied by `supabase db reset`.
  return f;
}

async function jobsForKeyPrefix(tx: Tx, prefix: string) {
  return tx.q<{ key: string; task_identifier: string; run_at: string; payload: Record<string, unknown> }>(
    `select j.key, t.identifier as task_identifier, j.run_at, j.payload
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where j.key like $1
      order by j.run_at`,
    [`${prefix}%`],
  );
}

describe("POL-proposals.award_points_hook", () => {
  it("approval enqueues one proposal_accepted job for the proposer and each accepted co-presenter, none for a declined one", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const proposer = f.a.members[0].memberId;
      const accepted = f.a.members[1].memberId;
      const declined = f.a.mod.memberId;

      const [proposal] = await tx.q<{ id: string }>(
        `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
         values ($1, $2, 'اقتراح اختبار النقاط', 'ملخص', $3, 'introductory', 'draft') returning id`,
        [f.a.id, proposer, f.a.categoryId],
      );
      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, proposal.id, accepted]);
      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted, declined_at) values ($1, $2, $3, false, now())`, [
        f.a.id,
        proposal.id,
        declined,
      ]);

      // Walk the legal edges (0011's guard): draft -> submitted -> in_review -> approved.
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [proposal.id]);
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [proposal.id]);
      await tx.q(`update public.proposals set state = 'approved' where id = $1`, [proposal.id]);

      const proposerJobs = await tx.q(`select id from graphile_worker._private_jobs where key = $1`, [`pts:proposal_accepted:${proposal.id}:${proposer}`]);
      expect(proposerJobs).toHaveLength(1);
      const acceptedJobs = await tx.q(`select id from graphile_worker._private_jobs where key = $1`, [`pts:proposal_accepted:${proposal.id}:${accepted}`]);
      expect(acceptedJobs).toHaveLength(1);
      const declinedJobs = await tx.q(`select id from graphile_worker._private_jobs where key = $1`, [`pts:proposal_accepted:${proposal.id}:${declined}`]);
      expect(declinedJobs).toEqual([]);
    });
  });

  it("end to end: the enqueued job awards proposal_accepted's 10 points", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const proposer = f.a.members[1].memberId;
      const [proposal] = await tx.q<{ id: string }>(
        `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
         values ($1, $2, 'اقتراح آخر', 'ملخص', $3, 'introductory', 'draft') returning id`,
        [f.a.id, proposer, f.a.categoryId],
      );
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [proposal.id]);
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [proposal.id]);
      await tx.q(`update public.proposals set state = 'approved' where id = $1`, [proposal.id]);

      await tx.asServiceRole();
      await tx.q(`select public.award_points('proposal_accepted', $1, 'proposal_accepted', $2, null)`, [proposer, proposal.id]);
      await tx.asOwner();
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [proposer]);
      expect(balance.total_points).toBe(10);
    });
  });
});

async function inProgressSession(tx: Tx, org: Org) {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at)
     values ($1, 'جلسة اكتمال', 'ملخص', $2, 'introductory', now() - interval '90 minutes', 60,
             now() - interval '30 minutes', $3, 40, 'in_progress', now() - interval '1 day')
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  return row.id;
}

describe("POL-sessions.completion_fanout", () => {
  it("completion enqueues one evaluate_no_shows job and two award_presenter_points jobs per accepted presenter", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await inProgressSession(tx, f.a);
      const presenter1 = f.a.members[0].memberId;
      const presenter2 = f.a.members[1].memberId;
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, sessionId, presenter1]);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, sessionId, presenter2]);

      await tx.q(`update public.sessions set state = 'completed' where id = $1`, [sessionId]);

      const noShowJobs = await tx.q(`select id from graphile_worker._private_jobs where key = $1`, [`noshow:${sessionId}`]);
      expect(noShowJobs).toHaveLength(1);

      for (const presenter of [presenter1, presenter2]) {
        const immediate = await jobsForKeyPrefix(tx, `pts:presenter:${sessionId}:${presenter}`);
        // the plain key and the :rating_bonus key both start with the same prefix
        const plain = immediate.find((j) => j.key === `pts:presenter:${sessionId}:${presenter}`);
        const delayed = immediate.find((j) => j.key === `pts:presenter:${sessionId}:${presenter}:rating_bonus`);
        expect(plain).toBeDefined();
        expect(delayed).toBeDefined();
        expect(plain!.task_identifier).toBe("award_presenter_points");
        expect(delayed!.task_identifier).toBe("award_presenter_points");
        expect(new Date(delayed!.run_at).getTime() - new Date(plain!.run_at).getTime()).toBeGreaterThan(47 * 60 * 60 * 1000); // ~48h apart
        expect(plain!.payload).toMatchObject({ session_id: sessionId, member_id: presenter });
      }
    });
  });

  it("a repeat update to the same state (no transition) fans out nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await inProgressSession(tx, f.a);
      await tx.q(`update public.sessions set state = 'completed' where id = $1`, [sessionId]);
      const before = await tx.q(`select id from graphile_worker._private_jobs where key = $1`, [`noshow:${sessionId}`]);
      // Touching an unrelated column with `state` still named but unchanged
      // (RETURNING the row, as a DAL that writes the whole row would) must
      // not raise and must not re-fan-out.
      await tx.q(`update public.sessions set state = state, title = title where id = $1`, [sessionId]);
      const after = await tx.q(`select id from graphile_worker._private_jobs where key = $1`, [`noshow:${sessionId}`]);
      expect(after).toEqual(before);
    });
  });

  it("evaluate_no_shows' query: a confirmed RSVP with no check-in is a no-show, recorded at 0 points (D40)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await inProgressSession(tx, f.a);
      const attendedMember = f.a.members[0].memberId;
      const noShowMember = f.a.members[1].memberId;
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, sessionId, attendedMember]);
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, sessionId, noShowMember]);
      await tx.q(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
        [f.a.id, sessionId, attendedMember, f.a.admin.memberId],
      );

      // The exact query worker/src/tasks/evaluate_no_shows.ts runs.
      const candidates = await tx.q<{ rsvp_id: string; member_id: string }>(
        `select r.id as rsvp_id, r.member_id
           from public.rsvps r
          where r.session_id = $1 and r.status = 'confirmed'
            and not exists (select 1 from public.check_ins c where c.session_id = r.session_id and c.member_id = r.member_id)`,
        [sessionId],
      );
      expect(candidates.map((c) => c.member_id)).toEqual([noShowMember]);

      await tx.asServiceRole();
      for (const c of candidates) {
        await tx.q(`select public.award_points('no_show', $1, 'no_show', $2, $3)`, [c.member_id, c.rsvp_id, sessionId]);
      }
      await tx.asOwner();
      const [row] = await tx.q<{ amount: number; rule_key: string }>(
        `select amount, rule_key from public.points_ledger where member_id = $1 and rule_key = 'no_show'`,
        [noShowMember],
      );
      expect(row).toEqual({ amount: 0, rule_key: "no_show" }); // present, at zero (D40) — not absent
    });
  });

  it("award_presenter_points' logic: session_delivered + attendee_bonus per check-in, rating_bonus only once the threshold is met", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await inProgressSession(tx, f.a);
      // members[1], not members[0]: fixture-m4.ts seeds a 10-point ledger
      // row for every org's members[0], which would contaminate this exact
      // balance assertion (award-points.test.ts's header note explains why).
      const presenter = f.a.members[1].memberId;
      const attendees = [f.a.admin.memberId, f.a.mod.memberId];
      for (const m of attendees) {
        await tx.q(
          `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
           values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
          [f.a.id, sessionId, m, f.a.admin.memberId],
        );
      }
      // The exact SQL worker/src/tasks/award_presenter_points.ts runs.
      await tx.asServiceRole();
      await tx.q(`select public.award_points('session_delivered', $1, 'session_delivered', $2, $2)`, [presenter, sessionId]);
      await tx.asOwner();
      const checkIns = await tx.q<{ id: string }>(`select id from public.check_ins where session_id = $1`, [sessionId]);
      await tx.asServiceRole();
      for (const { id } of checkIns) {
        await tx.q(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [presenter, id, sessionId]);
      }

      await tx.asOwner();
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [presenter]);
      expect(balance.total_points).toBe(50 + 2 * 2); // session_delivered (50) + two attendees at 2 each

      // No ratings yet — rating_bonus must not have been awarded.
      const noBonus = await tx.q(`select id from public.points_ledger where member_id = $1 and rule_key = 'rating_bonus'`, [presenter]);
      expect(noBonus).toEqual([]);
    });
  });
});
