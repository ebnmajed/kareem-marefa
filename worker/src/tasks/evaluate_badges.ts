import type { Task } from "graphile-worker";

// JOB-evaluate_badges (11 §2.3, REQ-REC-001, REQ-REC-002). Nightly. All the
// logic lives in public.evaluate_badges() (supabase/proposed/scoring/
// 0007_recognition_evaluators.sql) so it is provable in the RLS suite.
export const evaluate_badges: Task = async (_payload, helpers) => {
  await helpers.query(`select public.evaluate_badges()`);
  helpers.logger.info("evaluate_badges: ran");
};
