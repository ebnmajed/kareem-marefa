import type { Task } from "graphile-worker";

// JOB-evaluate_streaks (11 §2.3, REQ-REC-005, A10). Nightly. All the logic
// lives in public.evaluate_streaks() (supabase/proposed/scoring/
// 0007_recognition_evaluators.sql) so it is provable in the RLS suite; this
// task is the schedule's door into it.
export const evaluate_streaks: Task = async (_payload, helpers) => {
  await helpers.query(`select public.evaluate_streaks()`);
  helpers.logger.info("evaluate_streaks: ran");
};
