import type { Task } from "graphile-worker";

// JOB-award_presenter_points (11 §2.3, A5, A10, 05 §1.2). Enqueued twice per
// presenter by sessions_completion_fanout() — once immediately, once at
// +48h for the rating_bonus recheck (supabase/proposed/scoring/
// 0004_award_presenter_points.sql). Every award goes through
// public.award_points(), which is idempotent — running this task twice for
// the same session/presenter re-awards nothing that already landed, so the
// two enqueues (and any retry) are safe.
//
// attendee_bonus is one award_points() call PER CHECK-IN, not one call
// carrying `amount = 2 × count`: the rule's own cap_per_session (30
// occurrences × 2 points = the 60-point ceiling, 05 §3.2) already expresses
// "up to 30 attendees" when called once per attendee, so there is no
// special-case cap logic to duplicate here.
//
// The 4.0-average / 5-rating threshold for rating_bonus is 05 §1.2's
// literal trigger condition, not a column in scoring_rules (only
// cap_per_session = 1 lives there) — hardcoded here as the source of truth
// the PRD names, distinct from org_settings.rating_min_aggregate (a
// different threshold, for whether ratings are shown publicly at all).
const RATING_BONUS_MIN_AVERAGE = 4.0;
const RATING_BONUS_MIN_COUNT = 5;

interface AwardPresenterPointsPayload {
  session_id: string;
  member_id: string;
}

function isPayload(p: unknown): p is AwardPresenterPointsPayload {
  const v = p as Partial<AwardPresenterPointsPayload> | null;
  return !!v && typeof v.session_id === "string" && typeof v.member_id === "string";
}

export const award_presenter_points: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`award_presenter_points: malformed payload ${JSON.stringify(payload)}`);
  const { session_id, member_id } = payload;

  await helpers.query(`select public.award_points('session_delivered', $1, 'session_delivered', $2, $2)`, [member_id, session_id]);

  const { rows: checkIns } = await helpers.query<{ id: string }>(`select id from public.check_ins where session_id = $1`, [session_id]);
  for (const { id } of checkIns) {
    await helpers.query(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [member_id, id, session_id]);
  }

  const { rows: agg } = await helpers.query<{ avg_stars: string | null; n: string }>(
    `select avg(session_stars)::numeric(10,2) as avg_stars, count(*) as n from public.ratings where session_id = $1`,
    [session_id],
  );
  const avgStars = agg[0]?.avg_stars !== null && agg[0]?.avg_stars !== undefined ? Number(agg[0].avg_stars) : null;
  const count = Number(agg[0]?.n ?? 0);
  if (avgStars !== null && avgStars >= RATING_BONUS_MIN_AVERAGE && count >= RATING_BONUS_MIN_COUNT) {
    await helpers.query(`select public.award_points('rating_bonus', $1, 'rating_bonus', $2, $2)`, [member_id, session_id]);
  }

  helpers.logger.info(
    `award_presenter_points: session ${session_id}, presenter ${member_id} — ${checkIns.length} attendee(s), avg ${avgStars ?? "n/a"} over ${count} rating(s)`,
  );
};
