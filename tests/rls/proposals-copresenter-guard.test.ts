// Wave 19 (DEC-214 §1, REQ-PRO-003) — a co-presenter's answer is theirs alone.
//
// Proposed by `sessions` as `supabase/proposed/sessions/w19_proposal_presenters_guard.sql`, promoted as `0168`.
//
// 03 §8.2 rows: POL-proposal_presenters.insert.unanswered
//               POL-proposal_presenters.insert.after_submission
//
// Proven as the PROPOSER, with the `authenticated` role and their claims — exactly what PostgREST runs for a
// direct `insert` — so the defect is shown where it lived: before the guard, the proposer's own client could
// write a colleague in as already accepted, and `create_session_from_proposal()` would copy them onto the session.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorMessage, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const FILE = "sessions/w19_proposal_presenters_guard.sql";

async function proposalOf(tx: Tx, categoryId: string, submit: boolean): Promise<string> {
  const [{ id }] = await tx.q<{ id: string }>(
    `select public.create_proposal('مقترح للاختبار', 'نبذة', $1, 'introductory', null, null, null, '{}'::uuid[], $2) as id`,
    [categoryId, submit],
  );
  return id;
}

const rowOf = (tx: Tx, proposal: string, member: string) =>
  tx.q<{ accepted: boolean; declined_at: string | null }>(
    `select accepted, declined_at from public.proposal_presenters where proposal_id = $1 and member_id = $2`,
    [proposal, member],
  );

describe("POL-proposal_presenters.insert.unanswered", () => {
  it("★ a proposer inserting a colleague as accepted gets an unanswered invitation", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      const f = await seed(tx);
      const me = f.a.members[0];
      const mate = f.a.members[1];
      await tx.as(me.claims);
      const proposal = await proposalOf(tx, f.a.categoryId, true);

      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, true)`, [
        f.a.id,
        proposal,
        mate.memberId,
      ]);
      expect(await rowOf(tx, proposal, mate.memberId)).toEqual([{ accepted: false, declined_at: null }]);
    });
  });

  it("a forged decline is cleared too — the answer is the co-presenter's", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const proposal = await proposalOf(tx, f.a.categoryId, false);
      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted, declined_at) values ($1, $2, $3, false, now())`, [
        f.a.id,
        proposal,
        f.a.members[1].memberId,
      ]);
      expect(await rowOf(tx, proposal, f.a.members[1].memberId)).toEqual([{ accepted: false, declined_at: null }]);
    });
  });

  it("create_proposal()'s own row for the proposer stays accepted", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      const f = await seed(tx);
      const me = f.a.members[0];
      await tx.as(me.claims);
      const proposal = await proposalOf(tx, f.a.categoryId, true);
      expect(await rowOf(tx, proposal, me.memberId)).toEqual([{ accepted: true, declined_at: null }]);
    });
  });

  it("the co-presenter still answers for themselves — the guard is on insert only", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      const f = await seed(tx);
      const mate = f.a.members[1];
      await tx.as(f.a.members[0].claims);
      const proposal = await proposalOf(tx, f.a.categoryId, true);
      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [f.a.id, proposal, mate.memberId]);
      await tx.as(mate.claims);
      await tx.q(`update public.proposal_presenters set accepted = true where proposal_id = $1 and member_id = $2`, [proposal, mate.memberId]);
      expect(await rowOf(tx, proposal, mate.memberId)).toEqual([{ accepted: true, declined_at: null }]);
    });
  });

  it("nobody may call the guard directly", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      await seed(tx);
      const grants = await tx.q<{ grantee: string }>(
        `select grantee from information_schema.routine_privileges
          where routine_schema = 'public' and routine_name = 'proposal_presenters_unanswered' and privilege_type = 'EXECUTE'`,
      );
      expect(grants.map((g) => g.grantee)).not.toContain("anon");
      expect(grants.map((g) => g.grantee)).not.toContain("authenticated");
      expect(grants.map((g) => g.grantee)).not.toContain("PUBLIC");
    });
  });
});

describe("POL-proposal_presenters.insert.after_submission — SCR-018's «+ أضف مُقدِّمًا مشاركًا» (DEC-213 §5.102)", () => {
  it("the proposer adds a co-presenter to a submitted proposal, and the invitation fires for the added row", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      const f = await seed(tx);
      const mate = f.a.members[1];
      await tx.as(f.a.members[0].claims);
      const proposal = await proposalOf(tx, f.a.categoryId, true);

      await tx.asOwner();
      await tx.q(`delete from public.notifications`);
      await tx.as(f.a.members[0].claims);
      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [f.a.id, proposal, mate.memberId]);

      await tx.asOwner();
      const invites = await tx.q<{ member_id: string; payload: { proposal_id: string } }>(
        `select member_id, payload from public.notifications where key = 'MSG-copresenter_invited'`,
      );
      expect(invites).toHaveLength(1);
      expect(invites[0].member_id).toBe(mate.memberId);
      expect(invites[0].payload.proposal_id).toBe(proposal);
    });
  });

  it("is refused once the proposal is decided", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const proposal = await proposalOf(tx, f.a.categoryId, true);
      await tx.asOwner();
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [proposal]);
      await tx.q(`update public.proposals set state = 'approved' where id = $1`, [proposal]);
      await tx.as(f.a.members[0].claims);
      const message = await errorMessage(() =>
        tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [f.a.id, proposal, f.a.members[1].memberId]),
      );
      expect(message).toContain("proposal_not_open_for_presenters");
    });
  });
});
