// REQ-RAT-006's "count only, never a value" case —
// supabase/proposed/event/04_rating_count_rpc.sql.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = "event/04_rating_count_rpc.sql";

describe("POL-ratings.count.presenter_or_staff", () => {
  it("a presenter with 1 rating gets 1 from the count function while the aggregate view stays empty", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      // members[0] presents f.m2.a.completed; the fixture seeds exactly one rating on it.
      await tx.as(f.a.members[0].claims);
      const [{ session_rating_count }] = await tx.q<{ session_rating_count: number }>(`select public.session_rating_count($1)`, [f.m2.a.completed]);
      expect(session_rating_count).toBe(1);
      expect(await tx.q(`select rating_count from public.session_rating_aggregates where session_id = $1`, [f.m2.a.completed])).toEqual([]); // 1 < default min of 3
    });
  });

  it("staff also gets the count", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);
      const [{ session_rating_count }] = await tx.q<{ session_rating_count: number }>(`select public.session_rating_count($1)`, [f.m2.a.completed]);
      expect(session_rating_count).toBe(1);
    });
  });

  it("an unrelated member gets 0 — indistinguishable from zero ratings, never an error", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      // members[1] attended and rated, but is not staff and does not present this session.
      await tx.asOwner();
      await tx.q(`delete from public.session_presenters where session_id = $1`, [f.m2.a.completed]);
      await tx.as(f.a.members[1].claims);
      const [{ session_rating_count }] = await tx.q<{ session_rating_count: number }>(`select public.session_rating_count($1)`, [f.m2.a.completed]);
      expect(session_rating_count).toBe(0);
    });
  });

  it("another org's session also reads as 0, not an error", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);
      const [{ session_rating_count }] = await tx.q<{ session_rating_count: number }>(`select public.session_rating_count($1)`, [f.m2.b.completed]);
      expect(session_rating_count).toBe(0);
    });
  });
});
