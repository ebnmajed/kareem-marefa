// Wave 20 — the cap, EXPLAINED (DEC-216 §5.5, REQ-UIX-072, REQ-PTS-003, REQ-PTS-006).
//
// supabase/proposed/scoring/w20_0002_capped.sql — `capped_award_explanations()`. ★ An explanation, never a ledger
// row, view or table: it reads the caller's own comments, own ledger and the org's rule, and writes nothing.
//
// 03 §8.2 rows proven here: RPC-capped_award_explanations.{own,full_now,deleted,anon}.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const FILE = "scoring/w20_0002_capped.sql";
// ★ wave 22 (DEC-232 §4.1): the explanation is judged by the rule AS IT STOOD when the comment was posted. The rule is
// set in `ready()` at the transaction's now(), so every comment below is posted at or after it — never before.
const AS_IT_STOOD = "scoring/cap_explained_as_it_stood.sql";

async function ready(tx: Tx) {
  await applyProposed(tx, FILE);
  await applyProposed(tx, AS_IT_STOOD);
  const f = await seed(tx);
  await tx.asOwner();
  // A cap of 2 comments at 2 points, so the test writes four rows, not ten.
  await tx.q(`update public.scoring_rules set cap_per_session = 2, points = 2, enabled = true where org_id = $1 and action_key = 'comment'`, [f.a.id]);
  return f;
}

async function session(tx: Tx, org: Org) {
  const [s] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة الحد', 'ملخص', $2, 'introductory', now() - interval '2 hours', 60, now() - interval '1 hour', $3, 40, 'published', now() - interval '1 day')
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  return s.id;
}

let n = 0;
/** A comment, and — when `paid` — the award `award_points()` would have written for it. */
async function comment(tx: Tx, org: Org, sessionId: string, author: string, paid: boolean, at = "now()") {
  const [c] = await tx.q<{ id: string }>(
    `insert into public.comments (org_id, session_id, author_id, body, created_at) values ($1, $2, $3, 'تعليق', ${at}) returning id`,
    [org.id, sessionId, author],
  );
  if (paid) {
    n += 1;
    await tx.q(
      `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
       values ($1, $2, 2, 'comment', $3, $4, 'تعليق', 'comment', $5)`,
      [org.id, author, c.id, sessionId, `test:cap:${n}:${c.id}`],
    );
  }
  return c.id;
}

type Row = { session_id: string; rule_key: string; cap_per_session: number; first_unpaid_at: Date };
const explain = (tx: Tx) => tx.q<Row>(`select * from public.capped_award_explanations()`);

describe("RPC-capped_award_explanations", () => {
  it("★ the cap full and a comment unpaid: one explanation, at the first unpaid comment, the cap read from the rule", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await session(tx, f.a);
      const me = f.a.members[0];
      await comment(tx, f.a, s, me.memberId, true, "now() + interval '1 minute'");
      await comment(tx, f.a, s, me.memberId, true, "now() + interval '2 minutes'");
      await comment(tx, f.a, s, me.memberId, false, "now() + interval '5 minutes'");
      await comment(tx, f.a, s, me.memberId, false, "now() + interval '8 minutes'");
      await tx.as(me.claims);
      const rows = await explain(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ session_id: s, rule_key: "comment", cap_per_session: 2 });
      const [{ first }] = await tx.q<{ first: Date }>(`select now() + interval '5 minutes' as first`);
      expect(rows[0].first_unpaid_at.toISOString()).toBe(first.toISOString());
    });
  });

  it("★ full_now: an unpaid comment while the cap is NOT full — a cooldown — is not explained", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await session(tx, f.a);
      const me = f.a.members[0];
      await comment(tx, f.a, s, me.memberId, true);
      await comment(tx, f.a, s, me.memberId, false);
      await tx.as(me.claims);
      expect(await explain(tx)).toEqual([]);
    });
  });

  it("deleted: a deleted comment is never explained as capped", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await session(tx, f.a);
      const me = f.a.members[0];
      await comment(tx, f.a, s, me.memberId, true);
      await comment(tx, f.a, s, me.memberId, true);
      const gone = await comment(tx, f.a, s, me.memberId, false);
      await tx.q(`update public.comments set deleted_at = now(), deleted_by = $2 where id = $1`, [gone, me.memberId]);
      await tx.as(me.claims);
      expect(await explain(tx)).toEqual([]);
    });
  });

  it("★ own: another member's capped session never appears", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await session(tx, f.a);
      const [me, other] = f.a.members;
      await comment(tx, f.a, s, other.memberId, true);
      await comment(tx, f.a, s, other.memberId, true);
      await comment(tx, f.a, s, other.memberId, false);
      await tx.as(other.claims);
      expect(await explain(tx)).toHaveLength(1);
      await tx.as(me.claims);
      expect(await explain(tx)).toEqual([]);
    });
  });

  it("no cap on the rule: nothing is explained", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.q(`update public.scoring_rules set cap_per_session = null where org_id = $1 and action_key = 'comment'`, [f.a.id]);
      const s = await session(tx, f.a);
      const me = f.a.members[0];
      await comment(tx, f.a, s, me.memberId, true);
      await comment(tx, f.a, s, me.memberId, false);
      await tx.as(me.claims);
      expect(await explain(tx)).toEqual([]);
    });
  });

  it("anon cannot execute it", async () => {
    await withTx(async (tx) => {
      await ready(tx);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.capped_award_explanations()`))).toBe("42501");
    });
  });
});
