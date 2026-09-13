// STORY-PRO-002 — co-presenters (REQ-PRO-003), against the proposed SQL.
//
// 03 §8.2 rows: POL-proposal_presenters.insert.same_org,
//               POL-proposal_presenters.insert.state,
//               RPC-create_proposal
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = "sessions/0002_copresenters.sql";
const CHECK_VIOLATION = "23514";

async function createProposal(tx: Tx, title: string, categoryId: string, coPresenters: string[] = [], submit = false) {
  const rows = await tx.q<{ create_proposal: string }>(
    `select public.create_proposal($1, 'ملخص المقترح', $2, 'introductory', null, null, null, $3::uuid[], $4) as create_proposal`,
    [title, categoryId, coPresenters, submit],
  );
  return rows[0].create_proposal;
}

describe("RPC-create_proposal", () => {
  it("creates the proposal, the proposer's accepted row and the named co-presenters in one act", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const me = f.a.members[0];
      await tx.as(me.claims);

      const id = await createProposal(tx, "ورشة عن أتمتة التقارير", f.a.categoryId, [f.a.members[1].memberId, f.a.mod.memberId], true);

      const [proposal] = await tx.q<{ proposer_id: string; state: string; org_id: string }>(
        `select proposer_id, state, org_id from public.proposals where id = $1`,
        [id],
      );
      expect(proposal.proposer_id).toBe(me.memberId);
      expect(proposal.state).toBe("submitted");
      expect(proposal.org_id).toBe(f.a.id);

      const presenters = await tx.q<{ member_id: string; accepted: boolean }>(
        `select member_id, accepted from public.proposal_presenters where proposal_id = $1 order by accepted desc`,
        [id],
      );
      expect(presenters).toHaveLength(3);
      // Proposing is accepting; the named two have not answered yet.
      expect(presenters[0]).toEqual({ member_id: me.memberId, accepted: true });
      expect(presenters.filter((p) => p.accepted)).toHaveLength(1);
    });
  });

  it("ignores a proposer who names themselves as their own co-presenter", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const me = f.a.members[0];
      await tx.as(me.claims);
      const id = await createProposal(tx, "مقترح فردي", f.a.categoryId, [me.memberId]);
      expect(await tx.q(`select member_id from public.proposal_presenters where proposal_id = $1`, [id])).toHaveLength(1);
    });
  });

  it("is atomic — a co-presenter from another org takes the proposal down with it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.members[0].claims);

      const title = "مقترح لن يوجد";
      expect(await errorMessage(() => createProposal(tx, title, f.a.categoryId, [f.b.members[0].memberId]))).toMatch(/presenter_not_in_org/);

      // Not "the proposal exists without presenters" — the proposal does not
      // exist. Three PostgREST calls would have left the first one committed.
      await tx.asOwner();
      expect(await tx.q(`select id from public.proposals where title = $1`, [title])).toEqual([]);
    });
  });

  it("cannot be used to propose on someone else's behalf or into another org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      // The function takes no proposer and no org: both come from the claims,
      // so there is no argument to lie in. A member of B calling it lands in B.
      await tx.as(f.b.members[0].claims);
      const id = await createProposal(tx, "مقترح من المؤسسة الأخرى", f.b.categoryId);
      const [row] = await tx.q<{ org_id: string; proposer_id: string }>(`select org_id, proposer_id from public.proposals where id = $1`, [id]);
      expect(row.org_id).toBe(f.b.id);
      expect(row.proposer_id).toBe(f.b.members[0].memberId);
      // And A cannot see it.
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select id from public.proposals where id = $1`, [id])).toEqual([]);
    });
  });

  it("still obeys presenters_within_limit — the lead presenter plus max_co_presenters", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.asOwner();
      await tx.q(`update public.org_settings set max_co_presenters = 1 where org_id = $1`, [f.a.id]);

      await tx.as(f.a.members[0].claims);
      await createProposal(tx, "مقدّم واحد معي", f.a.categoryId, [f.a.members[1].memberId]);
      expect(await errorMessage(() => createProposal(tx, "مقدّمان معي", f.a.categoryId, [f.a.members[1].memberId, f.a.mod.memberId]))).toMatch(
        /too_many_presenters/,
      );
    });
  });
});

describe("create_proposal composes with the 0011 audit trigger", () => {
  it("leaves one audit row per act, not one per insert", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // 0011 (the transition triggers) is a migration now; only this file is
      // still proposed. The pairing is what matters: the RPC's insert must
      // reach the audit trigger exactly once.
      await applyProposed(tx, PROPOSED);

      await tx.as(f.a.members[0].claims);
      const id = await createProposal(tx, "مقترح موثّق", f.a.categoryId, [f.a.members[1].memberId], true);

      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ action: string }>(
        `select action from public.audit_log where subject_type = 'proposal' and subject_id = $1 order by occurred_at, ctid`,
        [id],
      );
      // One act, one row: born submitted, so `proposal.submitted` and nothing
      // else. The presenter inserts are not proposal transitions.
      expect(rows.map((r) => r.action)).toEqual(["proposal.submitted"]);
    });
  });
});

describe("POL-proposal_presenters.insert.same_org", () => {
  it("refuses a member of another org even when the row's own org_id is the caller's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.members[0].claims);
      // The insert POLICY is satisfied: org_id is A's and the proposal is the
      // caller's. Only the trigger catches that the member is B's.
      expect(
        await errorCode(() =>
          tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [
            f.a.id,
            f.m2.a.proposal,
            f.b.members[0].memberId,
          ]),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });

  it("guards session_presenters the same way", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.session_presenters (org_id, session_id, member_id) values ($1, $2, $3)`, [f.a.id, f.m2.a.draft, f.b.members[0].memberId]),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });
});

describe("POL-proposal_presenters.insert.state", () => {
  it("naming stays open through review and closes at the decision", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const me = f.a.members[0];

      await tx.as(me.claims);
      const id = await createProposal(tx, "مقترح يمر بالمراجعة", f.a.categoryId, [], true);

      // submitted: still open — a change-request often IS "add someone".
      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [f.a.id, id, f.a.members[1].memberId]);

      await tx.asOwner();
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [id]);
      await tx.q(`update public.proposals set state = 'approved' where id = $1`, [id]);

      await tx.as(me.claims);
      // approved: closed. Otherwise a named member collects presenter points
      // and a certificate for a session nobody reviewed them onto.
      expect(
        await errorCode(() => tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [f.a.id, id, f.a.mod.memberId])),
      ).toBe(CHECK_VIOLATION);
    });
  });

  it("a declined co-presenter can still be removed after the decision", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const me = f.a.members[0];

      await tx.as(me.claims);
      const id = await createProposal(tx, "مقترح انسحب منه أحدهم", f.a.categoryId, [f.a.members[1].memberId], true);

      await tx.as(f.a.members[1].claims);
      const declined = await tx.q<{ declined_at: string }>(
        `update public.proposal_presenters set declined_at = now() where proposal_id = $1 and member_id = $2 returning declined_at`,
        [id, f.a.members[1].memberId],
      );
      expect(declined[0].declined_at).not.toBeNull();

      // Deletes are deliberately not state-locked: REQ-PRO-003 says a
      // declined co-presenter is removed, and a decline can arrive at any time.
      await tx.asOwner();
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [id]);
      await tx.q(`update public.proposals set state = 'approved' where id = $1`, [id]);
      await tx.as(me.claims);
      expect(
        await tx.q(`delete from public.proposal_presenters where proposal_id = $1 and member_id = $2 returning member_id`, [id, f.a.members[1].memberId]),
      ).toHaveLength(1);
    });
  });

  it("a named member answers only for themselves", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.members[0].claims);
      const id = await createProposal(tx, "مقترح بمقدّمين", f.a.categoryId, [f.a.members[1].memberId]);

      await tx.as(f.a.members[1].claims);
      expect(
        await tx.q(`update public.proposal_presenters set accepted = true where proposal_id = $1 and member_id = $2 returning accepted`, [
          id,
          f.a.members[1].memberId,
        ]),
      ).toHaveLength(1);
      // Not the proposer's row, and not to un-accept them.
      expect(
        await tx.q(`update public.proposal_presenters set accepted = false where proposal_id = $1 and member_id = $2 returning member_id`, [
          id,
          f.a.members[0].memberId,
        ]),
      ).toEqual([]);
    });
  });
});
