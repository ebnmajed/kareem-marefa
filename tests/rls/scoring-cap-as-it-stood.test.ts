// Wave 22, PR B — the cap, explained by the rule AS IT STOOD (DEC-232 §4.1, REQ-PTS-003, REQ-UIX-100).
//
// supabase/proposed/scoring/cap_explained_as_it_stood.sql — `capped_award_explanations()` judges each unpaid comment by
// the rule's points, enabled flag and cap at the moment it was posted, read through `scoring_rule_as_of()`. The job this
// proves (DEC-231 §0.3): an admin edits the catalogue on SCR-053 and SCR-022's explanation of what already happened does
// not change.
//
// ★ One transaction has one now(), so «the admin changed the rule LATER» is written by moving that change's history row
// an hour forward as the owner — the history row is the record the function reads, and the only thing the move
// changes. The rule itself is set first, at now(), and every comment is posted after it.
//
// 03 §8.2 rows proven here: RPC-capped_award_explanations.rule_as_it_stood, .not_before;
// RPC-scoring_rule_as_of.own_org.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function ready(tx: Tx, rule: { points: number; cap: number | null }) {
  await applyProposed(tx, "scoring/cap_explained_as_it_stood.sql");
  const f = await seed(tx);
  await tx.asOwner();
  await tx.q(`update public.scoring_rules set points = $2, cap_per_session = $3, enabled = true where org_id = $1 and action_key = 'comment'`, [
    f.a.id,
    rule.points,
    rule.cap,
  ]);
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
async function comment(tx: Tx, org: Org, sessionId: string, author: string, paid: { amount: number } | null, minutes: number) {
  const [c] = await tx.q<{ id: string }>(
    `insert into public.comments (org_id, session_id, author_id, body, created_at) values ($1, $2, $3, 'تعليق', now() + ($4 || ' minutes')::interval) returning id`,
    [org.id, sessionId, author, String(minutes)],
  );
  if (paid) {
    n += 1;
    await tx.q(
      `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
       values ($1, $2, $3, 'comment', $4, $5, 'تعليق', 'comment', $6)`,
      [org.id, author, paid.amount, c.id, sessionId, `test:as-it-stood:${n}:${c.id}`],
    );
  }
}

/** The admin's later edit: written through the table as the org's admin, then its history rows moved an hour on. */
async function editLater(tx: Tx, org: Org, set: string) {
  await tx.as(org.admin.claims);
  await tx.q(`update public.scoring_rules set ${set} where org_id = $1 and action_key = 'comment'`, [org.id]);
  await tx.asOwner();
  await tx.q(
    `update public.scoring_config_history h set changed_at = now() + interval '1 hour'
      where h.org_id = $1 and h.scope = 'scoring' and h.actor_id = $2
        and h.entity_id = (select id from public.scoring_rules where org_id = $1 and action_key = 'comment')`,
    [org.id, org.admin.memberId],
  );
}

type Row = { session_id: string; rule_key: string; cap_per_session: number };
async function explain(tx: Tx, who: Org["members"][number]) {
  await tx.as(who.claims);
  const rows = await tx.q<Row>(`select session_id, rule_key, cap_per_session from public.capped_award_explanations()`);
  await tx.asOwner();
  return rows;
}

/** A member who hit a cap of 2 comments at 2 points: two paid, one not. */
async function capped(tx: Tx, f: Awaited<ReturnType<typeof seed>>) {
  const s = await session(tx, f.a);
  const me = f.a.members[0];
  await comment(tx, f.a, s, me.memberId, { amount: 2 }, 1);
  await comment(tx, f.a, s, me.memberId, { amount: 2 }, 2);
  await comment(tx, f.a, s, me.memberId, null, 5);
  return { s, me };
}

describe("RPC-capped_award_explanations.rule_as_it_stood — an edit on SCR-053 never rewrites SCR-022's explanation", () => {
  it("★ points raised after the cap was hit: the explanation stays, naming the cap that applied", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx, { points: 2, cap: 2 });
      const { s, me } = await capped(tx, f);
      expect(await explain(tx, me)).toEqual([{ session_id: s, rule_key: "comment", cap_per_session: 2 }]);
      await editLater(tx, f.a, "points = 10");
      expect(await explain(tx, me)).toEqual([{ session_id: s, rule_key: "comment", cap_per_session: 2 }]);
    });
  });

  it("★ the cap raised after it was hit: the explanation stays, with the old cap", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx, { points: 2, cap: 2 });
      const { s, me } = await capped(tx, f);
      await editLater(tx, f.a, "cap_per_session = 5");
      expect(await explain(tx, me)).toEqual([{ session_id: s, rule_key: "comment", cap_per_session: 2 }]);
    });
  });

  it("★ the rule switched off after it was hit: the explanation stays", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx, { points: 2, cap: 2 });
      const { s, me } = await capped(tx, f);
      await editLater(tx, f.a, "enabled = false");
      expect(await explain(tx, me)).toEqual([{ session_id: s, rule_key: "comment", cap_per_session: 2 }]);
    });
  });

  it("not_before: a cap introduced AFTER the comments explains nothing about them", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx, { points: 2, cap: null });
      const { me } = await capped(tx, f);
      await editLater(tx, f.a, "cap_per_session = 1");
      expect(await explain(tx, me)).toEqual([]);
    });
  });

  it("an edit before the comments is the rule they were judged by", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx, { points: 2, cap: null });
      await tx.q(`update public.scoring_rules set cap_per_session = 2 where org_id = $1 and action_key = 'comment'`, [f.a.id]);
      const { s, me } = await capped(tx, f);
      expect(await explain(tx, me)).toEqual([{ session_id: s, rule_key: "comment", cap_per_session: 2 }]);
    });
  });
});

describe("RPC-scoring_rule_as_of.own_org", () => {
  it("answers for the caller's own org; anon cannot execute it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx, { points: 2, cap: 2 });
      await tx.q(`update public.scoring_rules set points = 7, cap_per_session = null where org_id = $1 and action_key = 'comment'`, [f.b.id]);
      await tx.as(f.b.members[0].claims);
      expect(await tx.q(`select * from public.scoring_rule_as_of('comment', now() + interval '1 minute')`)).toEqual([{ points: 7, enabled: true, cap_per_session: null }]);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select * from public.scoring_rule_as_of('comment', now() + interval '1 minute')`)).toEqual([{ points: 2, enabled: true, cap_per_session: 2 }]);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.scoring_rule_as_of('comment', now())`))).toBe("42501");
    });
  });
});
