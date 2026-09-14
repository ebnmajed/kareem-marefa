// supabase/proposed/scoring/0003_award_hooks_ratings_comments.sql —
// rating_submitted and comment points, hooked in as triggers on `ratings`
// and `comments` (STORY-PTS-002, docs/plan/notes/scoring.md).
//
// 03 §8.2 rows proven here: POL-ratings.award_points_hook,
// POL-comments.award_points_hook.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed, type Org } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  // Promoted as migrations 0028 and 0029 at wave-2 sync 2: applied by `supabase db reset`.
  return f;
}

/** A fresh completed session with its own checked-in member — avoids the M2
 * fixture's own rating (session_id, member_id) unique row entirely. */
async function completedSessionWithCheckIn(tx: Tx, org: Org, member: string) {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة نقاط التقييم', 'ملخص', $2, 'introductory',
             now() - interval '2 hours', 60, now() - interval '1 hour',
             $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour')
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  const [checkIn] = await tx.q<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'اختبار', $4, 'empty'::tstzrange) returning id`,
    [org.id, session.id, member, org.admin.memberId],
  );
  return { sessionId: session.id, checkInId: checkIn.id };
}

async function jobForKey(tx: Tx, key: string) {
  return tx.q<{ task_identifier: string; payload: Record<string, unknown> }>(
    `select t.identifier as task_identifier, j.payload
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where j.key = $1`,
    [key],
  );
}

describe("POL-ratings.award_points_hook", () => {
  it("submitting a rating enqueues exactly one award_points job, keyed by the rating id", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, checkInId } = await completedSessionWithCheckIn(tx, f.a, member);

      await tx.as(f.a.members[1].claims);
      const [rating] = await tx.q<{ id: string }>(
        `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars)
         values ($1, $2, $3, $4, 5, 5) returning id`,
        [f.a.id, sessionId, member, checkInId],
      );

      await tx.asOwner();
      const jobs = await jobForKey(tx, `pts:rating:${rating.id}`);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("award_points");
      expect(jobs[0].payload).toMatchObject({ rule: "rating_submitted", source: "rating", source_id: rating.id, member_id: member, session_id: sessionId });
    });
  });

  it("end to end: the enqueued job awards the ledger row (REQ-PTS-001)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, checkInId } = await completedSessionWithCheckIn(tx, f.a, member);

      await tx.as(f.a.members[1].claims);
      const [rating] = await tx.q<{ id: string }>(
        `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars)
         values ($1, $2, $3, $4, 4, 4) returning id`,
        [f.a.id, sessionId, member, checkInId],
      );

      await tx.asOwner();
      const [job] = await jobForKey(tx, `pts:rating:${rating.id}`);
      await tx.asServiceRole();
      await tx.q(`select public.award_points($1, $2, $3, $4, $5)`, [
        job.payload.rule,
        job.payload.member_id,
        job.payload.source,
        job.payload.source_id,
        job.payload.session_id,
      ]);
      await tx.asOwner();
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [member]);
      expect(balance.total_points).toBe(5); // rating_submitted's A10 default
    });
  });
});

describe("POL-comments.award_points_hook", () => {
  it("posting a comment enqueues exactly one award_points job, keyed by the comment id", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.members[1].claims);
      const [comment] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق اختبار') returning id`,
        [f.a.id, f.m2.a.completed, f.a.members[1].memberId],
      );

      await tx.asOwner();
      const jobs = await jobForKey(tx, `pts:comment:${comment.id}`);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("award_points");
      expect(jobs[0].payload).toMatchObject({
        rule: "comment",
        source: "comment",
        source_id: comment.id,
        member_id: f.a.members[1].memberId,
        session_id: f.m2.a.completed,
      });
    });
  });

  it("a reply is a comment too — it earns the hook exactly the same way", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.members[1].claims);
      const [reply] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, parent_id, body) values ($1, $2, $3, $4, 'رد اختبار') returning id`,
        [f.a.id, f.m2.a.published, f.a.members[1].memberId, f.m2.a.commentId],
      );
      await tx.asOwner();
      const jobs = await jobForKey(tx, `pts:comment:${reply.id}`);
      expect(jobs).toHaveLength(1);
    });
  });

  // Note: the M2 fixture's own seeded comment/rating rows are written by
  // seed() BEFORE ready() applies this proposed migration's triggers (a
  // consequence of applyProposed running after the fixture in this test
  // harness, not of the trigger itself) — once promoted as a real migration
  // the trigger exists at schema-creation time and fires for those rows too,
  // same as it does here for every insert made after it exists.
});
