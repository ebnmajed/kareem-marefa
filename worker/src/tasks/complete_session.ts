import type { Task } from "graphile-worker";

// JOB-complete_session (11 §2.1, REQ-SES-004). Cron, every minute.
//
// `11` §2.1 calls this "the single fan-out point for everything that happens
// when a session ends" — presenter points, no-show evaluation, certificates,
// the rating prompt — and says so precisely because five scattered triggers
// would make "what happens at completion" a question with five answers.
//
// None of those four jobs exists yet: award_presenter_points and
// evaluate_no_shows are M4, issue_certificates is M6, rating_prompt is M3.
// They are deliberately NOT enqueued: graphile-worker permanently fails a job
// whose task name has no handler, so enqueuing them now would turn every
// completed session into a stuck job and a false alert. Each milestone adds
// its own `addJob` line here, and this comment is the list.
//
// The check-in window closes inside `clock_complete_sessions()`, in the same
// transaction as the completion, because REQ-CHK-004 has no room for a gap in
// which the session is over and the code still works.
export const complete_session: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ session_id: string }>(`select public.clock_complete_sessions() as session_id`);

  if (rows.length > 0) {
    helpers.logger.info(`complete_session: completed ${rows.length} session(s); check-in windows closed`);
  }
};
