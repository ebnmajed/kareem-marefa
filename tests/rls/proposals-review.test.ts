// STORY-PRO-003 — admin review with reasons (REQ-PRO-005, REQ-PRO-006).
//
// 03 §8.2 rows: RPC-review_proposal.admin_only,
//               RPC-review_proposal.reason,
//               RPC-review_proposal.path
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = "sessions/0003_proposal_review.sql";
const CHECK_VIOLATION = "23514";

/** A submitted proposal of org A, owned by members[0]. */
async function submitted(tx: Tx, f: Awaited<ReturnType<typeof seed>>, title = "مقترح للمراجعة") {
  await tx.as(f.a.members[0].claims);
  const [{ id }] = await tx.q<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
     values ($1, $2, $3, 'ملخص', $4, 'introductory', 'submitted') returning id`,
    [f.a.id, f.a.members[0].memberId, title, f.a.categoryId],
  );
  return id;
}

const review = (tx: Tx, id: string, action: string, reason: string | null = null) =>
  tx.q<{ state: string; decision_reason: string | null }>(`select state, decision_reason from public.review_proposal($1, $2, $3)`, [id, action, reason]);

describe("RPC-review_proposal.admin_only", () => {
  it("refuses a member, a moderator, and an admin of another org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await submitted(tx, f);

      // The proposer themselves.
      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => review(tx, id, "approve"))).toMatch(/not_an_admin/);

      // A moderator: staff for reading (03 §5.2a), not for deciding.
      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => review(tx, id, "approve"))).toMatch(/not_an_admin/);

      // Org B's admin: an admin, but not of this proposal's org. The definer
      // bypasses RLS, so this is the written org scope doing the work.
      await tx.as(f.b.admin.claims);
      expect(await errorMessage(() => review(tx, id, "approve"))).toMatch(/proposal_not_found/);

      // And the proposal did not move under any of them.
      await tx.asOwner();
      expect((await tx.q<{ state: string }>(`select state from public.proposals where id = $1`, [id]))[0].state).toBe("submitted");
    });
  });

  it("refuses an admin whose claims are stale (03 §1.3)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await submitted(tx, f);
      // A token minted before the row changed: the definer re-reads rather
      // than believing the claim it was handed.
      await tx.as({ ...f.a.admin.claims, claims_version: (f.a.admin.claims.claims_version ?? 0) + 5 });
      expect(await errorCode(() => review(tx, id, "approve"))).toBe(PERMISSION_DENIED);
    });
  });

  it("still cannot write the table directly, which is why the RPC exists", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await submitted(tx, f);
      await tx.as(f.a.admin.claims);
      // `proposals` has no admin update policy at all (0010): the update
      // matches no row rather than raising.
      expect(await tx.q(`update public.proposals set state = 'approved' where id = $1 returning id`, [id])).toEqual([]);
    });
  });
});

describe("RPC-review_proposal.reason", () => {
  it("refuses a rejection or a change-request with no reason, or with only spaces", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await submitted(tx, f);
      await tx.as(f.a.admin.claims);

      for (const action of ["reject", "request_changes"]) {
        expect(await errorCode(() => review(tx, id, action))).toBe(CHECK_VIOLATION);
        expect(await errorCode(() => review(tx, id, action, "   "))).toBe(CHECK_VIOLATION);
      }
      await tx.asOwner();
      expect((await tx.q<{ state: string }>(`select state from public.proposals where id = $1`, [id]))[0].state).toBe("submitted");
    });
  });

  it("puts the reason where the proposer can read it, and in the audit row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await submitted(tx, f);
      const reason = "وضّح الفئة المستهدفة قبل أن نعتمده";

      await tx.as(f.a.admin.claims);
      const [row] = await review(tx, id, "request_changes", reason);
      expect(row.state).toBe("changes_requested");
      expect(row.decision_reason).toBe(reason);

      // REQ-PRO-008: the proposer sees the reason on their own proposal.
      await tx.as(f.a.members[0].claims);
      const [mine] = await tx.q<{ decision_reason: string }>(`select decision_reason from public.proposals where id = $1`, [id]);
      expect(mine.decision_reason).toBe(reason);
      // …and cannot rewrite it.
      expect(await errorCode(() => tx.q(`update public.proposals set decision_reason = 'لا' where id = $1`, [id]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      const audit = await tx.q<{ action: string; reason: string | null }>(
        `select action, reason from public.audit_log where subject_type = 'proposal' and subject_id = $1 order by occurred_at, ctid`,
        [id],
      );
      expect(audit.at(-1)).toEqual({ action: "proposal.changes_requested", reason });
    });
  });

  it("approval clears a previous change-request's reason", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await submitted(tx, f);

      await tx.as(f.a.admin.claims);
      await review(tx, id, "request_changes", "أضف مثالًا عمليًا");
      await tx.as(f.a.members[0].claims);
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [id]);

      await tx.as(f.a.admin.claims);
      const [row] = await review(tx, id, "approve");
      expect(row.state).toBe("approved");
      // Left on the row it would read as reservations under «مقبول». It is
      // still in the audit log, which is where a past decision belongs.
      expect(row.decision_reason).toBeNull();
    });
  });
});

describe("RPC-review_proposal.path", () => {
  it("walks a submitted proposal through in_review, auditing both moves", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await submitted(tx, f);

      await tx.as(f.a.admin.claims);
      expect((await review(tx, id, "approve"))[0].state).toBe("approved");

      const audit = await tx.q<{ action: string }>(
        `select action from public.audit_log where subject_type = 'proposal' and subject_id = $1 order by occurred_at, ctid`,
        [id],
      );
      // One click for the admin; the record shows the path 02 §6.1 defines.
      expect(audit.map((a) => a.action)).toEqual(["proposal.submitted", "proposal.in_review", "proposal.approved"]);
    });
  });

  it("opens a proposal without deciding it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await submitted(tx, f);
      await tx.as(f.a.admin.claims);
      expect((await review(tx, id, "open"))[0].state).toBe("in_review");
      expect(await errorCode(() => review(tx, id, "open"))).toBe(CHECK_VIOLATION);
    });
  });

  it("will not decide a draft, or re-decide a decided proposal", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);

      // The fixture's proposal is a draft: it has not been submitted, so
      // there is nothing to review.
      expect(await errorMessage(() => review(tx, f.m2.a.proposal, "approve"))).toMatch(/proposal_not_in_review/);

      const id = await submitted(tx, f, "مقترح يُرفض");
      await tx.as(f.a.admin.claims);
      await review(tx, id, "reject", "خارج نطاق اهتمام المؤسسة");
      expect(await errorMessage(() => review(tx, id, "approve"))).toMatch(/proposal_not_in_review/);
    });
  });

  it("refuses an action it does not know", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await submitted(tx, f);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => review(tx, id, "publish"))).toMatch(/unknown_review_action/);
    });
  });
});
