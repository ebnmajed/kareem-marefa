// The audited admin path onto per-rater ratings (REQ-RAT-005) —
// supabase/proposed/event/02_ratings_admin_rpc.sql. See docs/plan/notes/event.md
// §0 for why the existing direct-select policy (0010, ratings_read_admin) is
// left as written rather than narrowed here.
import { afterAll, describe, expect, it } from "vitest";
import { errorMessage, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());


describe("POL-ratings.select.admin.audited", () => {
  it("a fresh admin gets the org's rows for that session, and it is audited", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);

      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ id: string; member_id: string }>(`select * from public.list_session_ratings_admin($1)`, [f.m2.a.completed]);
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(f.m2.a.ratingId);

      await tx.asOwner();
      const audit = await tx.q<{ action: string; actor_id: string; subject_id: string }>(
        `select action, actor_id, subject_id from public.audit_log where org_id = $1 and action = 'ratings.read_admin' order by occurred_at desc limit 1`,
        [f.a.id],
      );
      expect(audit.length).toBe(1);
      expect(audit[0].actor_id).toBe(f.a.admin.memberId);
      expect(audit[0].subject_id).toBe(f.m2.a.completed);
    });
  });

  it("a moderator is rejected — this is admin-only (REQ-ADM-020)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => tx.q(`select * from public.list_session_ratings_admin($1)`, [f.m2.a.completed]))).toMatch(/not_an_admin/);
    });
  });

  it("a stale admin (claims_version lags the row) is rejected", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as({ ...f.a.admin.claims, claims_version: (f.a.admin.claims.claims_version ?? 0) + 1 });
      expect(await errorMessage(() => tx.q(`select * from public.list_session_ratings_admin($1)`, [f.m2.a.completed]))).toMatch(/stale_claims/);
    });
  });

  it("another org's session is rejected, not merely empty", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.list_session_ratings_admin($1)`, [f.m2.b.completed]))).toMatch(/not_found/);
    });
  });
});
