import type { Task } from "graphile-worker";

// JOB-evaluate_no_shows (11 §2.2, OQ-004, REQ-PTS-008). Enqueued once, at
// completion, by the trigger in
// supabase/proposed/scoring/0004_award_presenter_points.sql
// (sessions_completion_fanout). A `no_show` event is recorded — at 0 points,
// per its scoring_rules default (D40) — for every confirmed RSVP with no
// check-in, whether or not the org has turned the penalty on. That is what
// lets an admin see what *would* have been penalised before deciding to
// enable it.
interface EvaluateNoShowsPayload {
  session_id: string;
}

function isPayload(p: unknown): p is EvaluateNoShowsPayload {
  return !!p && typeof (p as EvaluateNoShowsPayload).session_id === "string";
}

export const evaluate_no_shows: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`evaluate_no_shows: malformed payload ${JSON.stringify(payload)}`);

  const { rows } = await helpers.query<{ rsvp_id: string; member_id: string }>(
    `select r.id as rsvp_id, r.member_id
       from public.rsvps r
      where r.session_id = $1 and r.status = 'confirmed'
        and not exists (select 1 from public.check_ins c where c.session_id = r.session_id and c.member_id = r.member_id)`,
    [payload.session_id],
  );

  for (const { rsvp_id, member_id } of rows) {
    await helpers.query(`select public.award_points('no_show', $1, 'no_show', $2, $3)`, [member_id, rsvp_id, payload.session_id]);
  }
  helpers.logger.info(`evaluate_no_shows: session ${payload.session_id} — ${rows.length} no-show event(s) recorded`);
};
