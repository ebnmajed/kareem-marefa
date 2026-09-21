import type { Task } from "graphile-worker";

// JOB-record_survey_response (11 §2, REQ-SUR-004, REQ-SUR-009, DEC-160 §3).
//
// The member's action wrote two things and neither was the answer: the rating,
// and the register row that says «this member answered». THIS job carries the
// answers, and its payload names nobody: `{response_id, survey_id, answers}`.
// It runs at a jittered `run_at` between ten minutes and four hours after the
// submit, computed in SQL by `submit_survey_response()`, and it has NO job key
// — `enqueue_job()` always passes `job_key_mode => 'replace'`, so a key would
// collapse two responses into one, and a key derived from the member would be
// the leak in a single string.
//
// ★ WHAT THIS FILE MUST NEVER DO, and it is the whole reason it is three lines
// long: put a payload, an id or anything else from the answers into a log line
// or an error message. `award_points.ts` throws
// `malformed payload ${JSON.stringify(payload)}` — correct there, fatal here:
// a worker log carrying a member's answers is exactly the artefact DEC-160 §3.5
// forbids, and worker logs outlive the queue row. So the refusal names the
// SHAPE that was wrong and nothing that was in it, and the success line is a
// count.
//
// Idempotency is `response_id` plus `on conflict (id) do nothing` inside
// `public.record_survey_response()`, so a retried job writes one response and
// reports zero answers the second time.
interface RecordSurveyResponsePayload {
  response_id: string;
  survey_id: string;
  answers: unknown[];
}

function isPayload(p: unknown): p is RecordSurveyResponsePayload {
  const v = p as Partial<RecordSurveyResponsePayload> | null;
  return !!v && typeof v.response_id === "string" && typeof v.survey_id === "string" && Array.isArray(v.answers);
}

export const record_survey_response: Task = async (payload, helpers) => {
  if (!isPayload(payload)) {
    // The shape, never the contents.
    throw new Error("record_survey_response: malformed payload — expected response_id, survey_id and an answers array");
  }
  const { rows } = await helpers.query<{ written: number }>(
    `select public.record_survey_response($1, $2, $3::jsonb) as written`,
    [payload.response_id, payload.survey_id, JSON.stringify(payload.answers)],
  );
  const written = rows[0]?.written ?? 0;
  helpers.logger.info(`record_survey_response: stored 1 response with ${written} answers`);
};
