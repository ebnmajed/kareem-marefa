// supabase/proposed/scoring/0009_counting_completed.sql — REQ-PTS-015's
// «streaks and badges that count attended sessions count completed ones».
//
// 03 §8.2 rows proven here: RPC-evaluate_streaks.counts_completed_sessions,
// RPC-evaluate_badges.counts_completed_sessions.
//
// The MODERATOR throughout, a member with no check-in of its own in the
// fixture (fixture-m2 gives members[1] two this month — the trap in
// docs/plan/notes/scoring.md, wave 9).
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, "scoring/0009_counting_completed.sql");
  await tx.asOwner();
  return f;
}

/** A one-day session `offset` days out; arrived_at defaults to now(), so every
 *  check-in lands in the org's current month whatever the session's date. */
async function attended(tx: Tx, org: Org, member: string, offset: number, state: string): Promise<string> {
  await tx.asOwner();
  const [s] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'جلسة العدّ', 'ملخص', $2, 'introductory', now() + ($4 || ' days')::interval, 60,
             now() + ($4 || ' days')::interval + interval '1 hour', $3, 40, $5::public.session_state, now() - interval '1 day', true)
     returning id`,
    [org.id, org.categoryId, org.venueId, String(offset), state],
  );
  await tx.q(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by)
     values ($1, $2, $3, 'manual', 'حضر', $4)`,
    [org.id, s.id, member, org.admin.memberId],
  );
  return s.id;
}

async function completeAll(tx: Tx, ids: string[]): Promise<void> {
  await tx.asOwner();
  for (const id of ids) await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [id]);
}

describe("RPC-evaluate_streaks.counts_completed_sessions", () => {
  it("three sessions attended but still running complete no streak; the same three completed do", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.mod.memberId;
      const ids = [await attended(tx, f.a, member, 10, "in_progress"), await attended(tx, f.a, member, 20, "in_progress"), await attended(tx, f.a, member, 30, "in_progress")];
      const [rule] = await tx.q<{ id: string; required_count: number }>(`select id, required_count from public.streak_rules where org_id = $1 and enabled limit 1`, [f.a.id]);
      expect(rule.required_count).toBe(3);

      const awards = async () => {
        await tx.asServiceRole();
        await tx.q(`select public.evaluate_streaks()`);
        await tx.asOwner();
        return tx.q(`select id from public.streak_awards where member_id = $1 and rule_id = $2`, [member, rule.id]);
      };
      expect(await awards()).toEqual([]);
      await completeAll(tx, ids);
      expect(await awards()).toHaveLength(1);
    });
  });
});

describe("RPC-evaluate_badges.counts_completed_sessions", () => {
  it("first_check_in waits for the session to complete", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.mod.memberId;
      const id = await attended(tx, f.a, member, 10, "in_progress");
      const held = async () => {
        await tx.asServiceRole();
        await tx.q(`select public.evaluate_badges()`);
        await tx.asOwner();
        return tx.q(
          `select mb.id from public.member_badges mb join public.badges b on b.id = mb.badge_id where mb.member_id = $1 and b.key = 'first_check_in'`,
          [member],
        );
      };
      expect(await held()).toEqual([]);
      await completeAll(tx, [id]);
      expect(await held()).toHaveLength(1);
    });
  });
});
