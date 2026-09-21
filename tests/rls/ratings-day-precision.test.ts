// supabase/proposed/event/01_ratings_day_precision.sql — `ratings` holds no
// instant finer than a day (E5, DEC-160 §3.4, REQ-SUR-009).
//
// 03 §8.2 rows proven here: POL-ratings.day_precision.insert,
// POL-ratings.day_precision.update, POL-ratings.day_precision.backfill,
// POL-ratings.day_precision.no_award, POL-ratings.aggregate.comment_order.
//
// ★ The file is applied AFTER the fixture is seeded, deliberately: the M2
// fixture writes its rating with a precise `now()`, so the backfill in the
// file has a row to act on. Once the lead promotes the file, `applyProposed`
// is a no-op and the same row is coarsened by the trigger at insert time
// instead — which is why the backfill case asserts the INVARIANT («no row in
// `ratings` holds an instant finer than a day») rather than the mechanism.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const FILE = "event/01_ratings_day_precision.sql";

/** A fresh completed session with a check-in for `member` — the M2 fixture's
 *  own session already carries a rating by its attendee, and `ratings` is
 *  unique per (session, member). */
async function completedSessionWithCheckIn(tx: Tx, org: Org, member: string) {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة دقة التاريخ', 'ملخص', $2, 'introductory',
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

/** Every instant the row holds, answered in SQL — a JS `Date` comparison would
 *  drag the runner's own zone into a test about zones. */
async function instants(tx: Tx, ratingId: string) {
  const [row] = await tx.q<{ submitted_midnight: boolean; edited_midnight: boolean | null; submitted_today: boolean }>(
    `select (submitted_at at time zone 'UTC')::time = '00:00:00'::time                       as submitted_midnight,
            case when edited_at is null then null
                 else (edited_at at time zone 'UTC')::time = '00:00:00'::time end            as edited_midnight,
            submitted_at = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'    as submitted_today
       from public.ratings where id = $1`,
    [ratingId],
  );
  return row;
}

describe("POL-ratings.day_precision.insert / .update", () => {
  it("a member's rating is stored at midnight UTC, and an edit coarsens `edited_at` too", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.asOwner();
      const { sessionId, checkInId } = await completedSessionWithCheckIn(tx, f.a, f.a.members[0].memberId);

      // Written exactly as the app writes it: a plain RLS insert, no RPC, no
      // `submitted_at` of its own (`lib/dal/ratings.ts:115`).
      await tx.as(f.a.members[0].claims);
      const [rating] = await tx.q<{ id: string }>(
        `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars, comment)
         values ($1, $2, $3, $4, 5, 4, 'ملاحظة') returning id`,
        [f.a.id, sessionId, f.a.members[0].memberId, checkInId],
      );

      const written = await instants(tx, rating.id);
      expect(written.submitted_midnight).toBe(true);
      expect(written.submitted_today).toBe(true);
      expect(written.edited_midnight).toBeNull();

      // ★ The edit path is the reason the trigger covers UPDATE: `main`'s app
      // writes `edited_at` from JavaScript at millisecond precision
      // (`lib/dal/ratings.ts:146`) and keeps doing so until Vercel redeploys.
      await tx.q(
        `update public.ratings set session_stars = 4, comment = 'ملاحظة معدلة', edited_at = now() where id = $1`,
        [rating.id],
      );
      const edited = await instants(tx, rating.id);
      expect(edited.edited_midnight).toBe(true);
      expect(edited.submitted_midnight).toBe(true);

      // Coarsening a row that is already coarse moves nothing.
      await tx.q(`update public.ratings set comment = 'ملاحظة ثالثة' where id = $1`, [rating.id]);
      expect(await instants(tx, rating.id)).toEqual(edited);
    });
  });

  it("★ truncates in UTC whatever the connection's TimeZone is — the trap an unpinned `date_trunc` walks into", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.asOwner();
      const { sessionId, checkInId } = await completedSessionWithCheckIn(tx, f.a, f.a.members[0].memberId);
      // `date_trunc('day', <timestamptz>)` truncates in the SESSION's zone. In
      // Riyadh, 23:30 UTC belongs to the NEXT local day, so an unpinned
      // expression would store 2026-03-01T21:00Z here and 2026-03-01T00:00Z on
      // the worker's connection — the same rating at two instants.
      await tx.q(`set local timezone = 'Asia/Riyadh'`);
      const [rating] = await tx.q<{ id: string }>(
        `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars, submitted_at)
         values ($1, $2, $3, $4, 3, 3, timestamptz '2026-03-01 23:30:00+00') returning id`,
        [f.a.id, sessionId, f.a.members[0].memberId, checkInId],
      );
      const [row] = await tx.q<{ utc_midnight: boolean; riyadh_midnight: boolean }>(
        `select submitted_at = timestamptz '2026-03-01 00:00:00+00' as utc_midnight,
                submitted_at = timestamptz '2026-03-02 00:00:00+03' as riyadh_midnight
           from public.ratings where id = $1`,
        [rating.id],
      );
      await tx.q(`set local timezone = 'UTC'`);
      expect(row.utc_midnight).toBe(true);
      expect(row.riyadh_midnight).toBe(false);
    });
  });
});

describe("POL-ratings.day_precision.backfill / .no_award", () => {
  it("no row in `ratings` holds an instant finer than a day, including the ones written before the file", async () => {
    await withTx(async (tx) => {
      await seed(tx); // the M2 fixture writes its rating with a precise now()
      await applyProposed(tx, FILE);

      await tx.asOwner();
      const [count] = await tx.q<{ fine: string }>(
        `select count(*)::text as fine from public.ratings
          where submitted_at <> date_trunc('day', submitted_at at time zone 'UTC') at time zone 'UTC'
             or (edited_at is not null
                 and edited_at <> date_trunc('day', edited_at at time zone 'UTC') at time zone 'UTC')`,
      );
      expect(count.fine).toBe("0");
    });
  });

  it("the backfill awards nothing: `ratings_award_points` is `after insert`, and one rating still has exactly one job", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.asOwner();
      const jobs = await tx.q<{ key: string }>(
        `select j.key from graphile_worker._private_jobs j
           join graphile_worker._private_tasks t on t.id = j.task_id
          where j.key = $1 and t.identifier = 'award_points'`,
        [`pts:rating:${f.m2.a.ratingId}`],
      );
      expect(jobs).toHaveLength(1);
    });
  });
});

describe("POL-ratings.aggregate.comment_order", () => {
  it("the presenter's comments are ordered by the rating's random id, never by when they were written", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.asOwner();
      const [session] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, state, published_at, completed_at)
         values ($1, 'جلسة ترتيب الملاحظات', 'ملخص', $2, 'introductory',
                 now() - interval '2 hours', 60, now() - interval '1 hour',
                 $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour')
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );

      // Three raters, because `rating_min_aggregate` is 3 by default and the
      // view withholds the whole row below it — the minimum is not lowered.
      const raters = [f.a.members[0].memberId, f.a.members[1].memberId, f.a.mod.memberId];
      const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
      const comments = ["ملاحظة واحد", "ملاحظة اثنان", "ملاحظة ثلاثة"];
      // ★ WRITTEN IN AN ORDER THAT IS NOT THE ID ORDER: third, first, second.
      // If the view still ordered by submission, `comments` would come back
      // «ثلاثة, واحد, اثنان» and this case would say so.
      for (const i of [2, 0, 1]) {
        const [checkIn] = await tx.q<{ id: string }>(
          `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
           values ($1, $2, $3, 'manual', 'اختبار', $4, 'empty'::tstzrange) returning id`,
          [f.a.id, session.id, raters[i], f.a.admin.memberId],
        );
        await tx.q(
          `insert into public.ratings (id, org_id, session_id, member_id, check_in_id, session_stars, presenter_stars, comment)
           values ($1, $2, $3, $4, $5, 5, 5, $6)`,
          [ids[i], f.a.id, session.id, raters[i], checkIn.id, comments[i]],
        );
      }

      await tx.as(f.a.admin.claims);
      const [agg] = await tx.q<{ rating_count: number; comments: string[] }>(
        `select rating_count, comments from public.session_rating_aggregates where session_id = $1`,
        [session.id],
      );
      expect(agg.rating_count).toBe(3);
      expect(agg.comments).toEqual(comments);
    });
  });
});
