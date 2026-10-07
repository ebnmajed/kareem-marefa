// DEC-278 (0219) — the two doors `JOB-backfill_story_derivatives` uses: the photographs still without a `story`
// derivative, and the mark that one was made. Service-role only, as every worker door (CLAUDE.md, data rule 6).
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("RPC-story_derivatives_wanted / RPC-mark_story_derivative_ready", () => {
  it("the worker lists a photograph without a derivative, marks it, and it is not listed again", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const photo = f.m5.a.photoId;
      await tx.asServiceRole();
      const wanted = () => tx.q<{ photo_id: string }>(`select photo_id from public.story_derivatives_wanted(100)`).then((r) => r.map((x) => x.photo_id));
      expect(await wanted()).toContain(photo);
      await tx.q(`select public.mark_story_derivative_ready($1)`, [photo]);
      expect(await wanted()).not.toContain(photo);
      await tx.asOwner();
      expect((await tx.q<{ ready: boolean }>(`select story_derivative_ready as ready from public.photos where id = $1`, [photo]))[0].ready).toBe(true);
    });
  });

  it("a removed photograph is never listed, and older than 30 days is not either", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.photos set created_at = now() - interval '31 days' where id = $1`, [f.m5.a.photoId]);
      await tx.q(`update public.photos set removed_at = now() where id = $1`, [f.m5.b.photoId]);
      await tx.asServiceRole();
      const ids = (await tx.q<{ photo_id: string }>(`select photo_id from public.story_derivatives_wanted(100)`)).map((r) => r.photo_id);
      expect(ids).not.toContain(f.m5.a.photoId);
      expect(ids).not.toContain(f.m5.b.photoId);
    });
  });

  it("a member, staff included, may call neither", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.story_derivatives_wanted(10)`))).toBe("42501");
      expect(await errorCode(() => tx.q(`select public.mark_story_derivative_ready($1)`, [f.m5.a.photoId]))).toBe("42501");
    });
  });
});
