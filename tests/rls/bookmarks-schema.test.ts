// bookmarks — 02 §4.15, REQ-DSC-006. Applied with applyProposed() inside
// each test's rolled-back transaction (DEC-040). Did not exist before this
// file — docs/plan/notes/content.md §0.1.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-bookmarks.self", () => {
  it("a member reads and writes only their own bookmarks; another member's bookmark is invisible", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.

      await tx.as(f.a.members[1].claims);
      await tx.q(`insert into public.bookmarks (org_id, member_id, session_id) values ($1, $2, $3)`, [f.a.id, f.a.members[1].memberId, f.m2.a.published]);

      expect(
        await errorCode(() =>
          tx.q(`insert into public.bookmarks (org_id, member_id, session_id) values ($1, $2, $3)`, [f.a.id, f.a.members[0].memberId, f.m2.a.draft])),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select session_id from public.bookmarks where member_id = $1`, [f.a.members[1].memberId])).toEqual([]);

      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select session_id from public.bookmarks where member_id = $1`, [f.a.members[1].memberId])).length).toBe(1);

      await tx.q(`delete from public.bookmarks where member_id = $1 and session_id = $2`, [f.a.members[1].memberId, f.m2.a.published]);
      await tx.asOwner();
      expect(await tx.q(`select 1 from public.bookmarks where member_id = $1 and session_id = $2`, [f.a.members[1].memberId, f.m2.a.published])).toEqual([]);
    });
  });

  it("bookmarks are never referenced by the scoring catalogue, and are private regardless of session visibility (REQ-DSC-006)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.as(f.a.members[1].claims); // not the presenter of the draft session
      const [b] = await tx.q<{ session_id: string }>(
        `insert into public.bookmarks (org_id, member_id, session_id) values ($1, $2, $3) returning session_id`,
        [f.a.id, f.a.members[1].memberId, f.m2.a.draft],
      );
      expect(b.session_id).toBe(f.m2.a.draft);

      await tx.as(f.b.admin.claims); // org B can never see org A's bookmark row
      expect(await tx.q(`select 1 from public.bookmarks where member_id = $1`, [f.a.members[1].memberId])).toEqual([]);
    });
  });
});
