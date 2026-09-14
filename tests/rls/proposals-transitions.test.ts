// STORY-PRO-001 — the proposal state machine. Authored against the proposed
// SQL (DEC-040) and promoted by the lead as migration 0011_proposal_transitions.sql
// at wave-1 sync point 1, so the triggers are now part of the schema.
//
// 03 §8.2 rows: POL-proposals.transition.audit, POL-proposals.transition.legal
// Serves: REQ-PRO-005, REQ-PRO-006 · 02 §6.1 is the normative diagram.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const CHECK_VIOLATION = "23514";

/**
 * A proposal created inside the test, so the insert itself is audited and the
 * audit rows asserted are exactly this proposal's.
 */
async function newProposal(tx: Tx, orgId: string, proposerId: string, categoryId: string, title: string, state = "draft") {
  const [{ id }] = await tx.q<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
     values ($1, $2, $3, 'ملخص المقترح', $4, 'introductory', $5::public.proposal_state) returning id`,
    [orgId, proposerId, title, categoryId, state],
  );
  return id;
}

/**
 * The audit rows written about one proposal, in the order they were written.
 *
 * NOT `order by occurred_at`: `audit_log.occurred_at` defaults to `now()`,
 * which is the TRANSACTION timestamp, so every row a single transaction
 * writes carries the same instant and their order is undefined. `ctid` is
 * insertion order within the transaction and is what this suite means by
 * "then". Worth the lead's eye — the same flatness will make a real audit
 * trail unorderable whenever one act writes several rows.
 */
async function auditFor(tx: Tx, proposalId: string) {
  return tx.q<{ action: string; before: unknown; after: { state: string }; reason: string | null; actor_id: string | null }>(
    `select action, before, after, reason, actor_id
       from public.audit_log
      where subject_type = 'proposal' and subject_id = $1
      order by occurred_at, ctid`,
    [proposalId],
  );
}

describe("POL-proposals.transition.audit", () => {
  it("a member creating a draft and then submitting it leaves two audit rows they did not write", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[0];

      await tx.as(me.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level)
         values ($1, $2, 'كيف اختصرنا وقت إعداد التقارير', 'تجربة عملية من فريقنا', $3, 'introductory')
         returning id`,
        [f.a.id, me.memberId, f.a.categoryId],
      );
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [id]);

      // The proposer cannot read audit_log at all (03 §5.10a) — the evidence
      // is not theirs to inspect, which is the point of it being evidence.
      expect(await auditFor(tx, id)).toEqual([]);

      await tx.as(f.a.admin.claims);
      const rows = await auditFor(tx, id);
      expect(rows.map((r) => r.action)).toEqual(["proposal.created", "proposal.submitted"]);
      expect(rows[0].actor_id).toBe(me.memberId);
      expect(rows[1].after.state).toBe("submitted");
      expect(rows[1].before).toEqual({ state: "draft" });
    });
  });

  it("a proposal born submitted is audited as submitted, not as created", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[0];

      await tx.as(me.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
         values ($1, $2, 'مقترح جاهز', 'ملخص', $3, 'intermediate', 'submitted') returning id`,
        [f.a.id, me.memberId, f.a.categoryId],
      );
      await tx.as(f.a.admin.claims);
      expect((await auditFor(tx, id)).map((r) => r.action)).toEqual(["proposal.submitted"]);
    });
  });

  it("an admin's rejection carries the written reason into the audit row (REQ-PRO-005)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const proposal = await newProposal(tx, f.a.id, f.a.members[0].memberId, f.a.categoryId, "مقترح للمراجعة");
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [proposal]);

      // No admin update policy exists on `proposals` (0010), so review runs as
      // a definer RPC — STORY-PRO-003. Here the owner stands in for it.
      await tx.asOwner();
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [proposal]);
      await tx.q(`update public.proposals set state = 'rejected', decision_reason = 'الموضوع مكرر مع جلسة الشهر الماضي' where id = $1`, [proposal]);

      await tx.as(f.a.admin.claims);
      const rows = await auditFor(tx, proposal);
      expect(rows.map((r) => r.action)).toEqual(["proposal.created", "proposal.submitted", "proposal.in_review", "proposal.rejected"]);
      expect(rows[3].reason).toBe("الموضوع مكرر مع جلسة الشهر الماضي");
    });
  });

  it("editing a proposal without moving it writes no audit row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[0];

      await tx.as(me.claims);
      const proposal = await newProposal(tx, f.a.id, me.memberId, f.a.categoryId, "مسودة تُحرَّر");
      await tx.q(`update public.proposals set title = 'عنوان منقّح', state = 'draft' where id = $1`, [proposal]);
      await tx.as(f.a.admin.claims);
      expect((await auditFor(tx, proposal)).map((r) => r.action)).toEqual(["proposal.created"]);
    });
  });

  it("nobody can write audit_log directly — the trigger is the only path", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const who of [f.a.members[0].claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(
          await errorCode(() =>
            tx.q(`insert into public.audit_log (org_id, action, subject_type, subject_id) values ($1, 'proposal.submitted', 'proposal', $2)`, [f.a.id, f.m2.a.proposal]),
          ),
        ).toBe(PERMISSION_DENIED);
      }
      await tx.asServiceRole();
      expect(
        await errorCode(() =>
          tx.q(`insert into public.audit_log (org_id, action, subject_type, subject_id) values ($1, 'proposal.submitted', 'proposal', $2)`, [f.a.id, f.m2.a.proposal]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-proposals.transition.legal", () => {
  it("only the edges of 02 §6.1 are permitted, for the owner as much as for a member", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const proposal = f.m2.a.proposal; // draft

      // Legal: draft → submitted → in_review → changes_requested → submitted
      await tx.as(f.a.members[0].claims);
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [proposal]);
      await tx.asOwner();
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [proposal]);
      await tx.q(`update public.proposals set state = 'changes_requested', decision_reason = 'وضّح الفئة المستهدفة' where id = $1`, [proposal]);

      // Illegal: changes_requested → draft. The POLICY allows it (03 §5.2b's
      // with-check lists `draft`); the diagram does not.
      expect(await errorCode(() => tx.q(`update public.proposals set state = 'draft' where id = $1`, [proposal]))).toBe(CHECK_VIOLATION);

      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [proposal]);

      // Illegal: submitted → approved. An admin opens a proposal before
      // deciding on it; skipping in_review would skip a state.
      expect(await errorCode(() => tx.q(`update public.proposals set state = 'approved' where id = $1`, [proposal]))).toBe(CHECK_VIOLATION);

      // Illegal: submitted → rejected, and any move out of a terminal state.
      expect(await errorCode(() => tx.q(`update public.proposals set state = 'rejected', decision_reason = 'لا' where id = $1`, [proposal]))).toBe(CHECK_VIOLATION);
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [proposal]);
      await tx.q(`update public.proposals set state = 'approved' where id = $1`, [proposal]);
      expect(await errorCode(() => tx.q(`update public.proposals set state = 'submitted' where id = $1`, [proposal]))).toBe(CHECK_VIOLATION);
    });
  });

  it("a member submitting their own draft still passes the guard", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q<{ state: string }>(`update public.proposals set state = 'submitted' where id = $1 returning state`, [f.m2.a.proposal]);
      expect(rows[0].state).toBe("submitted");
    });
  });
});
