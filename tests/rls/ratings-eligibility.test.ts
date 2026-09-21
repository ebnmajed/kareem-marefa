// supabase/proposed/event/02_rating_eligibility.sql — one definition of «the
// rating window is open» (§6, REQ-RAT-003, REQ-SUR-003).
//
// 03 §8.2 rows proven here: RPC-rating_window_open.completed_and_inside,
// RPC-rating_window_open.other_org, RPC-rating_window_open.not_public,
// POL-ratings.insert.window, POL-ratings.update.window.
//
// ★ The last two are rows `03` has always carried and nothing exercised: the
// existing rating cases prove the check-in half (`m2-schema.test.ts`
// POL-ratings.insert.check_in) and the removed-check-in half (0087), never the
// window. They are written here, against the re-created policies, because a
// rule that moves into a function needs the rule's own test to move with it.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, PERMISSION_DENIED, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const FILE = "event/02_rating_eligibility.sql";

/** A completed session whose `completed_at` is `daysAgo` old, with a check-in
 *  for `member`. The default window is 14 days (`org_settings`, 0004). */
async function completedSession(tx: Tx, org: Org, member: string, daysAgo: number) {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة نافذة التقييم', 'ملخص', $2, 'introductory',
             now() - make_interval(days => $4) - interval '2 hours', 60, now() - make_interval(days => $4) - interval '1 hour',
             $3, 40, 'completed', now() - make_interval(days => $4) - interval '1 day', now() - make_interval(days => $4))
     returning id`,
    [org.id, org.categoryId, org.venueId, daysAgo],
  );
  const [checkIn] = await tx.q<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'اختبار', $4, 'empty'::tstzrange) returning id`,
    [org.id, session.id, member, org.admin.memberId],
  );
  return { sessionId: session.id, checkInId: checkIn.id };
}

const open = async (tx: Tx, sessionId: string) =>
  (await tx.q<{ open: boolean }>(`select public.rating_window_open($1) as open`, [sessionId]))[0].open;

describe("RPC-rating_window_open", () => {
  it("true for a completed session inside the window; false before completion and false past it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.asOwner();
      const inside = await completedSession(tx, f.a, f.a.members[0].memberId, 2);
      const past = await completedSession(tx, f.a, f.a.members[1].memberId, 15);

      await tx.as(f.a.members[0].claims);
      expect(await open(tx, inside.sessionId)).toBe(true);
      expect(await open(tx, past.sessionId)).toBe(false);
      // The fixture's `published` session has never completed, and its `draft`
      // never will — «completed» is half the rule, not a formality.
      expect(await open(tx, f.m2.a.published)).toBe(false);
      expect(await open(tx, f.m2.a.draft)).toBe(false);
      // An id that is not a session at all answers false rather than raising:
      // nothing about a session is inferable from the difference.
      expect(await open(tx, "00000000-0000-4000-8000-000000000000")).toBe(false);
    });
  });

  it("★ false for another org's completed session, however recent — it answers about the caller's org only", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.asOwner();
      const theirs = await completedSession(tx, f.b, f.b.members[0].memberId, 1);

      await tx.as(f.a.members[0].claims);
      expect(await open(tx, theirs.sessionId)).toBe(false);
      // …and it is true for the org that owns it, so the case is about the
      // boundary and not about the session being closed anyway.
      await tx.as(f.b.members[0].claims);
      expect(await open(tx, theirs.sessionId)).toBe(true);
    });
  });

  it("anon cannot execute it; a member can (DEC-152 — a definer function has a deliberate grant)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.rating_window_open($1)`, [f.m2.a.completed]))).toBe(PERMISSION_DENIED);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`select public.rating_window_open($1)`, [f.m2.a.completed]))).toBeNull();
    });
  });
});

describe("POL-ratings.insert.window / POL-ratings.update.window", () => {
  it("the re-created policies accept inside the window and refuse past it — the rule moved into a function, not out of the policy", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.asOwner();
      const inside = await completedSession(tx, f.a, f.a.members[0].memberId, 2);
      const past = await completedSession(tx, f.a, f.a.members[1].memberId, 15);

      const rate = (who: { claims: Parameters<Tx["as"]>[0]; memberId: string }, s: { sessionId: string; checkInId: string }) =>
        tx.q<{ id: string }>(
          `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars)
           values ($1, $2, $3, $4, 5, 5) returning id`,
          [f.a.id, s.sessionId, who.memberId, s.checkInId],
        );

      await tx.as(f.a.members[0].claims);
      const [row] = await rate(f.a.members[0], inside);
      expect(row.id).toBeTruthy();

      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => rate(f.a.members[1], past))).toBe(PERMISSION_DENIED);

      // The edit window is the same window: an update inside it succeeds, and
      // the same row past it is refused — `using` is what the policy checks.
      await tx.as(f.a.members[0].claims);
      expect((await tx.q(`update public.ratings set session_stars = 4 where id = $1 returning id`, [row.id])).length).toBe(1);
      await tx.asOwner();
      await tx.q(`update public.sessions set completed_at = now() - interval '15 days' where id = $1`, [inside.sessionId]);
      await tx.as(f.a.members[0].claims);
      expect((await tx.q(`update public.ratings set session_stars = 3 where id = $1 returning id`, [row.id])).length).toBe(0);
    });
  });
});
