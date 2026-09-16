import type { Task } from "graphile-worker";

// JOB-evaluate_no_shows (11 §2.2, OQ-004, REQ-PTS-008). Enqueued once, at
// completion, by the trigger in
// supabase/proposed/scoring/0004_award_presenter_points.sql
// (sessions_completion_fanout). A `no_show` event is recorded — at 0 points,
// per its scoring_rules default (D40) — for every confirmed RSVP with no
// check-in, whether or not the org has turned the penalty on. That is what
// lets an admin see what *would* have been penalised before deciding to
// enable it.
//
// Post-launch (docs/plan/notes/scoring.md "Company points rules"): this
// task also runs the three company-level rules for the same session, via
// public.evaluate_company_points() (supabase/proposed/scoring/
// 0001_company_points.sql). Deliberately NOT a second job: the owner's
// company rules are "evaluated once, at completion", exactly the same
// contract this job already has, and sessions_completion_fanout() already
// enqueues exactly one evaluate_no_shows job per completed session — a
// second job type would need a new worker/src/index.ts registration this
// track does not own, for no behavioural difference. evaluate_company_points()
// is independently idempotent (its own idempotency_key per rule per
// company), so this being folded into a retried/replayed job is safe.
interface EvaluateNoShowsPayload {
  session_id: string;
}

function isPayload(p: unknown): p is EvaluateNoShowsPayload {
  return !!p && typeof (p as EvaluateNoShowsPayload).session_id === "string";
}

export const evaluate_no_shows: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`evaluate_no_shows: malformed payload ${JSON.stringify(payload)}`);

  // A check-in an admin removed (REQ-CHK-017, 0087) is no attendance. remove_check_in()
  // already awards this same key at removal; the filter keeps the two answers identical.
  const { rows } = await helpers.query<{ rsvp_id: string; member_id: string }>(
    `select r.id as rsvp_id, r.member_id
       from public.rsvps r
      where r.session_id = $1 and r.status = 'confirmed'
        and not exists (select 1 from public.check_ins c
                         where c.session_id = r.session_id and c.member_id = r.member_id
                           and c.removed_at is null)`,
    [payload.session_id],
  );

  for (const { rsvp_id, member_id } of rows) {
    await helpers.query(`select public.award_points('no_show', $1, 'no_show', $2, $3)`, [member_id, rsvp_id, payload.session_id]);
  }

  await helpers.query(`select public.evaluate_company_points($1)`, [payload.session_id]);

  helpers.logger.info(`evaluate_no_shows: session ${payload.session_id} — ${rows.length} no-show event(s) recorded, company rules evaluated`);
};
