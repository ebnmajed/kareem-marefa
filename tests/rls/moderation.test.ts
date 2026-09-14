// SCR-050/051/052 — the two gaps `event`'s and `content`'s own notes
// flagged for whoever built the moderation UI: `comments_audit_staff_
// actions()`, `remove_photo()`, `photos_audit_staff_actions()`'s reason
// pass-through, and `_reverse_photo_points()`. Applied with applyProposed()
// inside each test's rolled-back transaction (DEC-040).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorMessage, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["console/0003_moderation.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

describe("POL-comments.removal_audit", () => {
  it("a moderator's removal is audited with the reason; restoring is audited too", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.mod.claims);
      await tx.q(`update public.comments set deleted_at = now(), removal_reason = 'محتوى غير لائق' where id = $1`, [f.m2.a.commentId]);

      const removed = await tx.q<{ action: string; reason: string; subject_id: string }>(
        `select action, reason, subject_id from public.audit_log where action = 'comment.removed' and subject_id = $1`,
        [f.m2.a.commentId],
      );
      expect(removed).toEqual([{ action: "comment.removed", reason: "محتوى غير لائق", subject_id: f.m2.a.commentId }]);

      await tx.q(`update public.comments set deleted_at = null where id = $1`, [f.m2.a.commentId]);
      const restored = await tx.q(`select 1 from public.audit_log where action = 'comment.restored' and subject_id = $1`, [f.m2.a.commentId]);
      expect(restored).toHaveLength(1);
    });
  });
});

describe("POL-remove_photo", () => {
  it("a member is refused; a moderator succeeds — hides and removes the photo, with the reason and actor audited", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => tx.q(`select public.remove_photo($1, 'سبب')`, [f.m5.a.photoId]))).toMatch(/not_authorized/);

      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => tx.q(`select public.remove_photo($1, '')`, [f.m5.a.photoId]))).toMatch(/reason_required/);

      const [row] = await tx.q<{ removed_at: string; hidden_at: string; removal_reason: string }>(
        `select (r).removed_at, (r).hidden_at, (r).removal_reason from public.remove_photo($1, 'صورة تخالف السياسة') r`,
        [f.m5.a.photoId],
      );
      expect(row.removed_at).toBeTruthy();
      expect(row.hidden_at).toBeTruthy();
      expect(row.removal_reason).toBe("صورة تخالف السياسة");

      const audit = await tx.q<{ reason: string; actor_id: string }>(
        `select reason, actor_id from public.audit_log where action = 'photo.removed' and subject_id = $1`,
        [f.m5.a.photoId],
      );
      expect(audit).toEqual([{ reason: "صورة تخالف السياسة", actor_id: f.a.mod.memberId }]);

      // Idempotent: calling it again is a no-op, not a second audit row.
      await tx.q(`select public.remove_photo($1, 'مرة أخرى')`, [f.m5.a.photoId]);
      expect((await tx.q(`select 1 from public.audit_log where action = 'photo.removed' and subject_id = $1`, [f.m5.a.photoId])).length).toBe(1);
    });
  });

  it("resolves an open takedown and an open report on the same photo, and reverses the original award (REQ-PTS-013)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ id: takedownId }] = await tx.q<{ id: string }>(
        `insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3) returning id`,
        [f.a.id, f.m5.a.photoId, f.a.members[0].memberId],
      );
      const [{ id: reportId }] = await tx.q<{ id: string }>(
        `insert into public.reports (org_id, target, photo_id, reporter_id, reason) values ($1, 'photo', $2, $3, 'محتوى غير لائق') returning id`,
        [f.a.id, f.m5.a.photoId, f.a.members[1]?.memberId ?? f.a.members[0].memberId],
      );
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
         values ($1, $2, 3, 'photo', $3, $4, 'صورة من الجلسة', 'photo', $5)`,
        [f.a.id, f.a.members[1]?.memberId ?? f.a.members[0].memberId, f.m5.a.photoId, f.m2.a.published, `test-photo-award-${f.m5.a.photoId}`],
      );

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.remove_photo($1, 'سبب الإزالة')`, [f.m5.a.photoId]);

      await tx.asOwner();
      const takedown = await tx.q<{ resolution: string }>(`select resolution from public.photo_takedowns where id = $1`, [takedownId]);
      expect(takedown[0].resolution).toBe("removed");
      const report = await tx.q<{ status: string; resolution: string }>(`select status, resolution from public.reports where id = $1`, [reportId]);
      expect(report[0]).toEqual({ status: "resolved", resolution: "removed" });

      const reversal = await tx.q<{ amount: number; reason: string }>(
        `select amount, reason from public.points_ledger where source = 'reversal' and source_id in (select id from public.points_ledger where source = 'photo' and source_id = $1)`,
        [f.m5.a.photoId],
      );
      expect(reversal).toEqual([{ amount: -3, reason: "حُذف المحتوى" }]);
    });
  });

  it("an admin cannot remove another org's photo", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.remove_photo($1, 'سبب')`, [f.m5.b.photoId]))).toMatch(/not_found/);
    });
  });
});
