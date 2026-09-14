import type { Task } from "graphile-worker";

// JOB-rating_prompt — 11 §2.6, 08 §4.3, REQ-RAT-007. Key: `rate:{session_id}`.
//
// One job for the session, not one per attendee, and the filter runs HERE
// rather than at schedule time: most ratings arrive in the first hour, so a
// per-member job queued at completion would spend that hour being cancelled
// one member at a time. public.send_rating_prompt() does the filtering, so
// the set of "checked in and has not rated" is computed in one statement
// against the rows themselves.
export const rating_prompt: Task = async (payload, helpers) => {
  const sessionId = (payload as { session_id?: string } | null)?.session_id;
  if (!sessionId) throw new Error("rating_prompt: payload needs session_id");

  const { rows } = await helpers.query<{ prompted: number }>(`select public.send_rating_prompt($1::uuid) as prompted`, [sessionId]);
  helpers.logger.info(`rating_prompt: session ${sessionId} — ${rows[0]?.prompted ?? 0} attendee(s) prompted`);
};
