// supabase/proposed/scoring/0008_presenter_awards.sql with 0007's guard —
// REQ-SES-019, REQ-PTS-015, DEC-172 contract 2, DEC-174 rulings 1, 3, 7.
// Presenter awards follow the presenter: paid on joining after completion, a
// compensating row on leaving, and the next epoch on coming back.
//
// ★ The trigger is SECURITY DEFINER and is tested as the ADMIN writing through
// 0010's own policies (p2_admin_insert / p2_admin_delete) — the admin has no
// grant on points_ledger or the queue, so a green case proves the trigger, not
// the owner, wrote them.
//
// 03 §8.2 rows proven here: POL-session_presenters.pays_on_join_after_completion,
// .reverses_on_leave, .reverses_legacy_proposal_accepted,
// .epoch_repays_after_readd, .trigger_is_definer,
// RPC-award_points.presenter_sources_wait_for_completion,
// RPC-award_points.presenter_must_be_accepted, RPC-award_points.presenter_epoch.
//
// The presenter is members[1] (fixture-m4 seeds members[0] a ledger row).
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

async function makeSession(tx: Tx, org: Org, state: string, opts: { proposalId?: string; completedHoursAgo?: number } = {}): Promise<string> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, $2, 'جلسة المقدّمين', 'ملخص', $3, 'introductory', now() - interval '60 days', 60,
             now() - interval '60 days' + interval '1 hour', $4, 40, $5::public.session_state, now() - interval '100 days',
             case when $5 in ('completed','archived') then now() - ($6 || ' hours')::interval end, true)
     returning id`,
    [org.id, opts.proposalId ?? null, org.categoryId, org.venueId, state, String(opts.completedHoursAgo ?? 1)],
  );
  return row.id;
}

async function approvedProposal(tx: Tx, org: Org, proposer: string, coPresenters: string[] = []): Promise<string> {
  await tx.asOwner();
  const [p] = await tx.q<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
     values ($1, $2, 'مقترح المقدّمين', 'ملخص', $3, 'introductory', 'draft') returning id`,
    [org.id, proposer, org.categoryId],
  );
  await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, true)`, [org.id, p.id, proposer]);
  for (const m of coPresenters) {
    await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, true)`, [org.id, p.id, m]);
  }
  for (const state of ["submitted", "in_review", "approved"]) {
    await tx.q(`update public.proposals set state = $2::public.proposal_state where id = $1`, [p.id, state]);
  }
  return p.id;
}

type Job = { key: string; task: string; run_at: string; payload: Record<string, string | null> };
async function jobsFor(tx: Tx, sessionOrProposal: string, member: string): Promise<Job[]> {
  await tx.asOwner();
  return tx.q<Job>(
    `select j.key, t.identifier as task, j.run_at, j.payload from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where j.key in ($1, $2, $3) order by j.key`,
    [`pts:presenter:${sessionOrProposal}:${member}`, `pts:presenter:${sessionOrProposal}:${member}:rating_bonus`, `pts:proposal_accepted:${sessionOrProposal}:${member}`],
  );
}

/** What worker/src/tasks/award_presenter_points.ts runs, minus the ratings read. */
async function presenterJob(tx: Tx, sessionId: string, presenter: string): Promise<void> {
  await tx.asServiceRole();
  await tx.q(`select public.award_points('session_delivered', $1, 'session_delivered', $2, $2)`, [presenter, sessionId]);
  await tx.asOwner();
}

async function ledger(tx: Tx, member: string) {
  await tx.asOwner();
  return tx.q<{ id: string; amount: number; source: string; rule_key: string; reason: string; source_id: string; session_id: string | null; idempotency_key: string }>(
    `select id, amount, source, rule_key, reason, source_id, session_id, idempotency_key from public.points_ledger
      where member_id = $1 and (rule_key in ('session_delivered','attendee_bonus','rating_bonus','proposal_accepted')) order by occurred_at, id`,
    [member],
  );
}

describe("POL-session_presenters.pays_on_join_after_completion / .trigger_is_definer", () => {
  it("an admin's insert of an accepted presenter on a COMPLETED session enqueues the fan-out's jobs for them; before completion, none", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[1].memberId;
      const running = await makeSession(tx, f.a, "in_progress");
      const done = await makeSession(tx, f.a, "completed");

      await tx.as(f.a.admin.claims);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, running, presenter]);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, done, presenter]);

      expect(await jobsFor(tx, running, presenter)).toEqual([]);
      const jobs = await jobsFor(tx, done, presenter);
      expect(jobs.map((j) => [j.key, j.task])).toEqual([
        [`pts:presenter:${done}:${presenter}`, "award_presenter_points"],
        [`pts:presenter:${done}:${presenter}:rating_bonus`, "award_presenter_points"],
      ]);
      expect(jobs[0].payload).toEqual({ session_id: done, member_id: presenter });
    });
  });

  it("a pending row UPDATED to accepted pays the same (sessions' add, DEC-174); a completion more than 48 h ago needs one job", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[1].memberId;
      const s = await makeSession(tx, f.a, "completed", { completedHoursAgo: 72 });
      await tx.asOwner();
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, false)`, [f.a.id, s, presenter]);
      expect(await jobsFor(tx, s, presenter)).toEqual([]);

      await tx.q(`update public.session_presenters set accepted = true where session_id = $1 and member_id = $2`, [s, presenter]);
      expect((await jobsFor(tx, s, presenter)).map((j) => j.key)).toEqual([`pts:presenter:${s}:${presenter}`]);
    });
  });
});

describe("RPC-award_points.presenter_sources_wait_for_completion / .presenter_must_be_accepted", () => {
  it("session_delivered writes nothing before completion, nothing to a non-presenter, and once to an accepted presenter of a completed session", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[1].memberId;
      const s = await makeSession(tx, f.a, "in_progress");
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s, presenter]);

      await presenterJob(tx, s, presenter);
      expect(await ledger(tx, presenter)).toEqual([]);

      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [s]);
      await presenterJob(tx, s, f.a.mod.memberId); // not a presenter
      expect(await ledger(tx, f.a.mod.memberId)).toEqual([]);

      await presenterJob(tx, s, presenter);
      await presenterJob(tx, s, presenter);
      expect((await ledger(tx, presenter)).map((r) => [r.amount, r.idempotency_key])).toEqual([[50, `session_delivered:session_delivered:${s}:${presenter}:v1`]]);
    });
  });
});

describe("POL-session_presenters.reverses_on_leave / .epoch_repays_after_readd / RPC-award_points.presenter_epoch", () => {
  it("★ the trace: added after completion +50; deleted −50; the +48 h job pays nothing; re-added +50 under v2; replayed, nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[1].memberId;
      const s = await makeSession(tx, f.a, "completed");

      await tx.as(f.a.admin.claims);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s, presenter]);
      await presenterJob(tx, s, presenter);

      await tx.as(f.a.admin.claims);
      await tx.q(`delete from public.session_presenters where session_id = $1 and member_id = $2`, [s, presenter]);
      let rows = await ledger(tx, presenter);
      expect(rows.map((r) => [r.source, r.amount])).toEqual([
        ["session_delivered", 50],
        ["reversal", -50],
      ]);
      expect(rows[1]).toMatchObject({ reason: "أُزيل من مقدّمي الجلسة", rule_key: "session_delivered", source_id: rows[0].id, session_id: s, idempotency_key: `reversal:${rows[0].id}:v1` });

      // The +48 h job queued at the join runs after the removal: nothing.
      await presenterJob(tx, s, presenter);
      expect(await ledger(tx, presenter)).toHaveLength(2);

      await tx.as(f.a.admin.claims);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s, presenter]);
      await presenterJob(tx, s, presenter);
      await presenterJob(tx, s, presenter);
      rows = await ledger(tx, presenter);
      expect(rows.map((r) => [r.amount, r.idempotency_key])).toEqual([
        [50, `session_delivered:session_delivered:${s}:${presenter}:v1`],
        [-50, `reversal:${rows[0].id}:v1`],
        [50, `session_delivered:session_delivered:${s}:${presenter}:v2`],
      ]);
      await tx.asOwner();
      const [balance] = await tx.q<{ total: string }>(`select sum(amount)::text as total from public.points_ledger where member_id = $1 and session_id = $2`, [presenter, s]);
      expect(Number(balance.total)).toBe(50);
    });
  });

  it("accepted → false and a decline each reverse; an unrelated update reverses nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const a = f.a.members[1].memberId;
      const b = f.a.mod.memberId;
      const s = await makeSession(tx, f.a, "completed");
      for (const m of [a, b]) {
        await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s, m]);
        await presenterJob(tx, s, m);
      }
      await tx.asOwner();
      await tx.q(`update public.session_presenters set accepted = accepted where session_id = $1`, [s]);
      expect((await ledger(tx, a)).map((r) => r.amount)).toEqual([50]);

      await tx.q(`update public.session_presenters set accepted = false where session_id = $1 and member_id = $2`, [s, a]);
      await tx.q(`update public.session_presenters set accepted = false, declined_at = now() where session_id = $1 and member_id = $2`, [s, b]);
      expect((await ledger(tx, a)).map((r) => r.amount)).toEqual([50, -50]);
      expect((await ledger(tx, b)).map((r) => r.amount)).toEqual([50, -50]);
    });
  });

  it("the attendee bonus follows too — reversed with the presenter, and paid again under v2", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[1].memberId;
      const attendee = f.a.mod.memberId;
      const s = await makeSession(tx, f.a, "completed");
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s, presenter]);
      const [ci] = await tx.q<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by)
         values ($1, $2, $3, 'manual', 'حضر', $4) returning id`,
        [f.a.id, s, attendee, f.a.admin.memberId],
      );
      const bonus = async () => {
        await tx.asServiceRole();
        await tx.q(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [presenter, ci.id, s]);
        await tx.asOwner();
      };
      await bonus();
      await tx.q(`delete from public.session_presenters where session_id = $1 and member_id = $2`, [s, presenter]);
      await bonus(); // removed: nothing
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s, presenter]);
      await bonus();
      expect((await ledger(tx, presenter)).map((r) => [r.amount, r.idempotency_key.replace(/^reversal:.*/, "reversal")])).toEqual([
        [2, `attendee_bonus:attendee_bonus:${ci.id}:${presenter}:v1`],
        [-2, "reversal"],
        [2, `attendee_bonus:attendee_bonus:${ci.id}:${presenter}:v2`],
      ]);
    });
  });
});

describe("POL-session_presenters.reverses_legacy_proposal_accepted", () => {
  it("a proposal_accepted paid at approval before 0008 is reversed when that presenter leaves — before completion too — and paid again at completion if they return", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const proposer = f.a.members[1].memberId;
      const proposal = await approvedProposal(tx, f.a, proposer);
      const s = await makeSession(tx, f.a, "in_progress", { proposalId: proposal });
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s, proposer]);
      // What approval wrote before 0008: session_id null, source the proposal.
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key)
         values ($1, $2, 10, 'proposal_accepted', $3, null, 'قبول مقترح', 'proposal_accepted', 1, $4)`,
        [f.a.id, proposer, proposal, `proposal_accepted:proposal_accepted:${proposal}:${proposer}:v1`],
      );

      await tx.as(f.a.admin.claims);
      await tx.q(`delete from public.session_presenters where session_id = $1 and member_id = $2`, [s, proposer]);
      let rows = await ledger(tx, proposer);
      expect(rows.map((r) => [r.source, r.amount, r.reason])).toEqual([
        ["proposal_accepted", 10, "قبول مقترح"],
        ["reversal", -10, "أُزيل من مقدّمي الجلسة"],
      ]);

      await tx.as(f.a.admin.claims);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, s, proposer]);
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [s]);
      const [job] = await tx.q<{ payload: Record<string, string | null> }>(`select payload from graphile_worker._private_jobs where key = $1`, [
        `pts:proposal_accepted:${proposal}:${proposer}`,
      ]);
      await tx.asServiceRole();
      await tx.q(`select public.award_points($1, $2, $3, $4, $5)`, [job.payload.rule, job.payload.member_id, job.payload.source, job.payload.source_id, job.payload.session_id]);
      rows = await ledger(tx, proposer);
      expect(rows.map((r) => [r.amount, r.session_id])).toEqual([
        [10, null],
        [-10, null],
        [10, s],
      ]);
      expect(rows[2].idempotency_key).toBe(`proposal_accepted:proposal_accepted:${proposal}:${proposer}:v2`);
    });
  });
});
