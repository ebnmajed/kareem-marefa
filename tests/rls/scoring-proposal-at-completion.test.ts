// supabase/proposed/scoring/0008_presenter_awards.sql with 0007's guard —
// DEC-172 (the owner's answer) and DEC-174 ruling 5: proposal_accepted is paid
// when the session completes, not at approval, under the key it has always
// had, and it now names the session.
//
// 03 §8.2 rows proven here: POL-proposals.no_award_at_approval,
// POL-sessions.completion_pays_proposal_presenters,
// POL-sessions.proposal_accepted_never_twice,
// RPC-award_points.proposal_accepted_waits_for_completion.
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

/** proposer + co-presenters, as create_proposal() writes them (0012): the
 *  proposer's own accepted row, each co-presenter's row with its answer. */
async function approvedProposal(tx: Tx, org: Org, proposer: string, co: { member: string; accepted: boolean }[] = []): Promise<string> {
  await tx.asOwner();
  const [p] = await tx.q<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
     values ($1, $2, 'مقترح عند الاكتمال', 'ملخص', $3, 'introductory', 'draft') returning id`,
    [org.id, proposer, org.categoryId],
  );
  await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, true)`, [org.id, p.id, proposer]);
  for (const c of co) {
    await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, $4)`, [org.id, p.id, c.member, c.accepted]);
  }
  for (const state of ["submitted", "in_review", "approved"]) {
    await tx.q(`update public.proposals set state = $2::public.proposal_state where id = $1`, [p.id, state]);
  }
  return p.id;
}

async function sessionFrom(tx: Tx, org: Org, proposalId: string | null, presenters: string[]): Promise<string> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, $2, 'جلسة المقترح', 'ملخص', $3, 'introductory', now() - interval '60 days', 60,
             now() - interval '60 days' + interval '1 hour', $4, 40, 'in_progress', now() - interval '100 days', true)
     returning id`,
    [org.id, proposalId, org.categoryId, org.venueId],
  );
  for (const m of presenters) {
    await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [org.id, row.id, m]);
  }
  return row.id;
}

type Job = { key: string; payload: { rule: string; member_id: string; source: string; source_id: string; session_id: string | null } };
async function proposalJobs(tx: Tx, proposalId: string): Promise<Job[]> {
  await tx.asOwner();
  return tx.q<Job>(`select key, payload from graphile_worker._private_jobs where key like $1 order by key`, [`pts:proposal_accepted:${proposalId}:%`]);
}

async function run(tx: Tx, jobs: Job[]): Promise<void> {
  await tx.asServiceRole();
  for (const { payload: p } of jobs) {
    await tx.q(`select public.award_points($1, $2, $3, $4, $5)`, [p.rule, p.member_id, p.source, p.source_id, p.session_id]);
  }
  await tx.asOwner();
}

async function awards(tx: Tx, proposalId: string) {
  await tx.asOwner();
  return tx.q<{ member_id: string; amount: number; session_id: string | null; idempotency_key: string }>(
    `select member_id, amount, session_id, idempotency_key from public.points_ledger
      where source = 'proposal_accepted' and source_id = $1 order by idempotency_key`,
    [proposalId],
  );
}

describe("POL-proposals.no_award_at_approval", () => {
  it("an approval enqueues nothing and writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const proposal = await approvedProposal(tx, f.a, f.a.members[1].memberId, [{ member: f.a.mod.memberId, accepted: true }]);
      expect(await proposalJobs(tx, proposal)).toEqual([]);
      expect(await awards(tx, proposal)).toEqual([]);
    });
  });
});

describe("POL-sessions.completion_pays_proposal_presenters", () => {
  it("completion pays the session's accepted presenters who were on the proposal, under today's keys, naming the session", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const proposer = f.a.members[1].memberId;
      const co = f.a.mod.memberId;
      const declinedCo = f.a.admin.memberId;
      const outsider = f.a.members[0].memberId;
      const proposal = await approvedProposal(tx, f.a, proposer, [
        { member: co, accepted: true },
        { member: declinedCo, accepted: false },
      ]);
      // The admin also assigned someone who was never on the proposal, and the
      // declined co-presenter is on the session anyway: neither is paid.
      const s = await sessionFrom(tx, f.a, proposal, [proposer, co, declinedCo, outsider]);

      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [s]);
      const jobs = await proposalJobs(tx, proposal);
      expect(jobs.map((j) => j.key).sort()).toEqual([`pts:proposal_accepted:${proposal}:${co}`, `pts:proposal_accepted:${proposal}:${proposer}`].sort());
      expect(jobs.find((j) => j.payload.member_id === proposer)!.payload).toEqual({
        rule: "proposal_accepted",
        member_id: proposer,
        source: "proposal_accepted",
        source_id: proposal,
        session_id: s,
      });

      await run(tx, jobs);
      const rows = await awards(tx, proposal);
      expect(rows.map((r) => [r.member_id, r.amount, r.session_id, r.idempotency_key]).sort()).toEqual(
        [
          [co, 10, s, `proposal_accepted:proposal_accepted:${proposal}:${co}:v1`],
          [proposer, 10, s, `proposal_accepted:proposal_accepted:${proposal}:${proposer}:v1`],
        ].sort(),
      );
    });
  });

  it("a session an admin created directly pays no proposal_accepted", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await sessionFrom(tx, f.a, null, [f.a.members[1].memberId]);
      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [s]);
      const jobs = await tx.q(`select key from graphile_worker._private_jobs where key like 'pts:proposal_accepted:%' and payload ->> 'session_id' = $1`, [s]);
      expect(jobs).toEqual([]);
    });
  });
});

describe("POL-sessions.proposal_accepted_never_twice", () => {
  it("a proposal paid at approval before 0008 is not paid again at completion — the same ledger key", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const proposer = f.a.members[1].memberId;
      const proposal = await approvedProposal(tx, f.a, proposer);
      const s = await sessionFrom(tx, f.a, proposal, [proposer]);
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key)
         values ($1, $2, 10, 'proposal_accepted', $3, null, 'قبول مقترح', 'proposal_accepted', 1, $4)`,
        [f.a.id, proposer, proposal, `proposal_accepted:proposal_accepted:${proposal}:${proposer}:v1`],
      );
      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [s]);
      await run(tx, await proposalJobs(tx, proposal));
      await run(tx, await proposalJobs(tx, proposal));
      expect((await awards(tx, proposal)).map((r) => r.amount)).toEqual([10]);
    });
  });
});

describe("RPC-award_points.proposal_accepted_waits_for_completion", () => {
  it("a job queued at an approval seconds before the push writes nothing until the session completes", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const proposer = f.a.members[1].memberId;
      const proposal = await approvedProposal(tx, f.a, proposer);
      const call = async () => {
        await tx.asServiceRole();
        await tx.q(`select public.award_points('proposal_accepted', $1, 'proposal_accepted', $2, null)`, [proposer, proposal]);
        await tx.asOwner();
      };
      await call(); // no session yet
      const s = await sessionFrom(tx, f.a, proposal, [proposer]);
      await call(); // running
      expect(await awards(tx, proposal)).toEqual([]);
      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [s]);
      await call();
      expect((await awards(tx, proposal)).map((r) => r.amount)).toEqual([10]);
    });
  });
});
