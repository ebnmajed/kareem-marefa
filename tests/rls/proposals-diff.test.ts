// Wave 21, contract 5 — a proposal's content is captured at submission, so SCR-041 can show what changed since it
// was sent back (`DEC-228` §2). Proven against supabase/proposed/sessions/0179-proposal-audit.sql; once the lead
// promotes it as 0179, `applyProposed` is a no-op and the same assertions hold against the chain.
//
// 03 §8.2 rows: POL-proposals.transition.content, POL-proposals.edits.private
// Serves: REQ-UIX-088, REQ-PRO-006 · DEC-215 (no member-readable history)
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = "sessions/0179-proposal-audit.sql";
const CONTENT = ["title", "abstract", "category_id", "level", "target_audience", "expected_duration_minutes", "admin_notes"];

type Row = { action: string; before: Record<string, unknown> | null; after: Record<string, unknown> };

/** Insertion order within one transaction (`ctid`), as `proposals-transitions.test.ts` explains. */
async function auditFor(tx: Tx, proposalId: string): Promise<Row[]> {
  return tx.q<Row>(
    `select action, before, after from public.audit_log
      where subject_type = 'proposal' and subject_id = $1 order by occurred_at, ctid`,
    [proposalId],
  );
}

/** A member drafts and submits; the admin sends it back with a reason. Returns the proposal's id. */
async function sentBack(tx: Tx, f: Awaited<ReturnType<typeof seed>>): Promise<string> {
  const me = f.a.members[0];
  await tx.as(me.claims);
  const [{ id }] = await tx.q<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, expected_duration_minutes)
     values ($1, $2, 'كيف اختصرنا وقت إعداد التقارير', 'التقرير يأخذ يومًا', $3, 'introductory', 60) returning id`,
    [f.a.id, me.memberId, f.a.categoryId],
  );
  await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [id]);
  await tx.as(f.a.admin.claims);
  await tx.q(`select public.review_proposal($1, 'request_changes', 'اختصر المدة')`, [id]);
  return id;
}

describe("POL-proposals.transition.content", () => {
  it("the first submission records the content as the reviewer will read it", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, PROPOSED);
      const f = await seed(tx);
      const id = await sentBack(tx, f);

      const rows = await auditFor(tx, id);
      const submitted = rows.find((r) => r.action === "proposal.submitted")!;
      // The baseline: the one submitted row that left `draft` — unique, because no edge returns to draft.
      expect(submitted.before).toEqual({ state: "draft" });
      expect(Object.keys(submitted.after).sort()).toEqual(["state", ...CONTENT].sort());
      expect(submitted.after).toMatchObject({ abstract: "التقرير يأخذ يومًا", expected_duration_minutes: 60, target_audience: null });
    });
  });

  it("a resubmission records the content before AND after, in the one UPDATE that is both the edit and the transition", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, PROPOSED);
      const f = await seed(tx);
      const id = await sentBack(tx, f);

      await tx.as(f.a.members[0].claims);
      await tx.q(
        `update public.proposals set abstract = 'التقرير يأخذ نصف يوم من شخص واحد', expected_duration_minutes = 45, state = 'submitted' where id = $1`,
        [id],
      );

      await tx.as(f.a.admin.claims);
      const rows = await auditFor(tx, id);
      const resubmitted = rows.filter((r) => r.action === "proposal.submitted")[1];
      expect(resubmitted.before).toMatchObject({ state: "changes_requested", abstract: "التقرير يأخذ يومًا", expected_duration_minutes: 60 });
      expect(resubmitted.after).toMatchObject({ state: "submitted", abstract: "التقرير يأخذ نصف يوم من شخص واحد", expected_duration_minutes: 45 });
      // An unchanged field reads the same on both sides — the diff draws only what moved.
      expect(resubmitted.before!.title).toBe(resubmitted.after.title);
    });
  });

  it("every other transition's row is exactly what 0011 wrote", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, PROPOSED);
      const f = await seed(tx);
      const id = await sentBack(tx, f);

      const rows = await auditFor(tx, id);
      for (const r of rows.filter((x) => x.action !== "proposal.submitted" && x.action !== "proposal.created")) {
        expect(Object.keys(r.after).sort()).toEqual(["state", "title"]);
        expect(Object.keys(r.before ?? {})).toEqual(["state"]);
      }
      const created = rows.find((r) => r.action === "proposal.created")!;
      expect(created.before).toBeNull();
      expect(Object.keys(created.after).sort()).toEqual(["state", "title"]);
    });
  });
});

describe("POL-proposals.edits.private", () => {
  it("the proposer, a co-presenter's peer and a moderator who did not act read none of it; an admin reads it all", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, PROPOSED);
      const f = await seed(tx);
      const id = await sentBack(tx, f);

      await tx.as(f.a.members[0].claims);
      expect(await auditFor(tx, id)).toEqual([]);
      await tx.as(f.a.members[1].claims);
      expect(await auditFor(tx, id)).toEqual([]);
      await tx.as(f.a.mod.claims);
      expect(await auditFor(tx, id)).toEqual([]);
      // Another org's admin sees nothing either.
      await tx.as(f.b.admin.claims);
      expect(await auditFor(tx, id)).toEqual([]);

      await tx.as(f.a.admin.claims);
      expect((await auditFor(tx, id)).length).toBeGreaterThan(0);
    });
  });
});
