// REQ-EVT-014 (wave 22, F6) — `remove_comment()` (supabase/proposed/content/0003_remove_comment.sql): staff remove a
// comment from the event page with a reason, and every open report on it closes, in one transaction. Every call AS A
// MEMBER. The records are the triggers' — `comment.removed` with the reason (0059), `report.resolved` per report (0181)
// — and the function writes neither itself.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "content/0003_remove_comment.sql";
type Envelope = { outcome: string; resolved?: number };

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  return f;
}

async function remove(tx: Tx, comment: string, reason: string | null = "لغة غير لائقة"): Promise<Envelope> {
  const [row] = await tx.q<{ r: Envelope }>(`select public.remove_comment($1, $2) as r`, [comment, reason]);
  return row.r;
}

async function openReport(tx: Tx, org: string, comment: string, reporter: string) {
  const [row] = await tx.q<{ id: string }>(`insert into public.reports (org_id, target, comment_id, reporter_id, reason) values ($1, 'comment', $2, $3, 'إساءة') returning id`, [org, comment, reporter]);
  return row.id;
}

describe("remove_comment()", () => {
  it("a moderator removes a comment with its reason; both open reports close; one comment.removed with the reason; one report.resolved each", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const comment = f.m2.a.commentId;
      const r1 = await openReport(tx, f.a.id, comment, f.a.members[0].memberId);
      const r2 = await openReport(tx, f.a.id, comment, f.a.admin.memberId);

      await tx.as(f.a.mod.claims);
      expect(await remove(tx, comment)).toEqual({ outcome: "removed", resolved: 2 });

      await tx.asOwner();
      const [c] = await tx.q<{ deleted_at: string | null; deleted_by: string; removal_reason: string }>(`select deleted_at, deleted_by, removal_reason from public.comments where id = $1`, [comment]);
      expect(c.deleted_at).toBeTruthy();
      expect(c.deleted_by).toBe(f.a.mod.memberId);
      expect(c.removal_reason).toBe("لغة غير لائقة");
      const reports = await tx.q<{ status: string; resolution: string; resolved_by: string }>(`select status, resolution, resolved_by from public.reports where id = any($1::uuid[])`, [[r1, r2]]);
      expect(reports.every((r) => r.status === "resolved" && r.resolution === "removed" && r.resolved_by === f.a.mod.memberId)).toBe(true);
      expect(await tx.q(`select reason from public.audit_log where action = 'comment.removed' and subject_id = $1`, [comment])).toEqual([{ reason: "لغة غير لائقة" }]);
      const resolved = await tx.q(`select 1 from public.audit_log where action = 'report.resolved' and subject_id = any($1::uuid[])`, [[r1, r2]]);
      expect(resolved).toHaveLength(2);
    });
  });

  it("a member is refused and nothing is written", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const r = await openReport(tx, f.a.id, f.m2.a.commentId, f.a.members[0].memberId);
      await tx.as(f.a.members[0].claims);
      expect(await remove(tx, f.m2.a.commentId)).toEqual({ outcome: "not_authorized" });
      await tx.asOwner();
      expect((await tx.q(`select deleted_at from public.comments where id = $1`, [f.m2.a.commentId]))[0]).toEqual({ deleted_at: null });
      expect((await tx.q(`select status from public.reports where id = $1`, [r]))[0]).toEqual({ status: "open" });
    });
  });

  it("a visible comment needs a reason of three characters", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await remove(tx, f.m2.a.commentId, "ab")).toEqual({ outcome: "reason_required" });
      expect(await remove(tx, f.m2.a.commentId, null)).toEqual({ outcome: "reason_required" });
      await tx.asOwner();
      expect((await tx.q(`select deleted_at from public.comments where id = $1`, [f.m2.a.commentId]))[0]).toEqual({ deleted_at: null });
    });
  });

  it("a comment its author already deleted: its reports close, the author stays the deleter, no second comment.removed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const author = f.a.members[1] ?? f.a.members[0];
      const r = await openReport(tx, f.a.id, f.m2.a.commentId, f.a.mod.memberId);
      await tx.as(author.claims);
      await tx.q(`update public.comments set deleted_at = now() where id = $1`, [f.m2.a.commentId]);
      await tx.asOwner();
      const before = (await tx.q(`select 1 from public.audit_log where action = 'comment.removed' and subject_id = $1`, [f.m2.a.commentId])).length;

      await tx.as(f.a.admin.claims);
      expect(await remove(tx, f.m2.a.commentId, null)).toEqual({ outcome: "already_removed", resolved: 1 });
      await tx.asOwner();
      expect((await tx.q<{ deleted_by: string }>(`select deleted_by from public.comments where id = $1`, [f.m2.a.commentId]))[0].deleted_by).toBe(author.memberId);
      expect((await tx.q(`select 1 from public.audit_log where action = 'comment.removed' and subject_id = $1`, [f.m2.a.commentId])).length).toBe(before);
      expect((await tx.q(`select status from public.reports where id = $1`, [r]))[0]).toEqual({ status: "resolved" });
    });
  });

  it("another org's comment is not found; anon cannot execute it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await remove(tx, f.m2.b.commentId)).toEqual({ outcome: "not_found" });
      await tx.asAnon();
      expect(await errorCode(() => remove(tx, f.m2.a.commentId))).toBe("42501");
    });
  });
});
