// STORY-EVT-002's own-work cases on top of wave 0's tests/rls/m2-schema.test.ts
// (which already proves reply depth, the edit window, and moderator
// remove/restore). This file only covers what I added:
// supabase/proposed/event/03_comments_self_delete_rpc.sql.
import { afterAll, describe, expect, it } from "vitest";
import { errorMessage, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());


describe("POL-comments.delete.self_anytime", () => {
  it("an author deletes their own comment PAST the 15-minute edit window (REQ-EVT-005)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.comments set created_at = now() - interval '16 minutes' where id = $1`, [f.m2.a.commentId]);

      await tx.as(f.a.members[1].claims); // the comment's author (fixture-m2.ts)
      // The plain UPDATE path is still blocked by the time gate (unchanged, m2-schema.test.ts pins this).
      expect(await tx.q(`update public.comments set deleted_at = now() where id = $1 returning id`, [f.m2.a.commentId])).toEqual([]);
      // The RPC is not.
      await tx.q(`select public.delete_own_comment($1)`, [f.m2.a.commentId]);
      const [row] = await tx.q<{ deleted_at: string | null; deleted_by: string }>(`select deleted_at, deleted_by from public.comments where id = $1`, [f.m2.a.commentId]);
      expect(row.deleted_at).not.toBeNull();
      expect(row.deleted_by).toBe(f.a.members[1].memberId);
    });
  });

  it("cannot delete another member's comment", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims); // not the reply's author (presenter is)
      expect(await errorMessage(() => tx.q(`select public.delete_own_comment($1)`, [f.m2.a.replyId]))).toMatch(/not_author/);
    });
  });

  it("cannot delete a comment in another org, and it reads as not_found, not a bypass", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      expect(await errorMessage(() => tx.q(`select public.delete_own_comment($1)`, [f.m2.b.commentId]))).toMatch(/not_found/);
    });
  });

  it("a second call is an idempotent no-op, not an error", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      await tx.q(`select public.delete_own_comment($1)`, [f.m2.a.commentId]);
      await tx.q(`select public.delete_own_comment($1)`, [f.m2.a.commentId]); // does not throw
      const [row] = await tx.q<{ deleted_at: string }>(`select deleted_at from public.comments where id = $1`, [f.m2.a.commentId]);
      expect(row.deleted_at).not.toBeNull();
    });
  });
});
