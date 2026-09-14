import type { Task } from "graphile-worker";

// JOB-evaluate_levels_perks (11 §2.3, REQ-REC-003, REQ-REC-004,
// REQ-REC-006…008). Nightly, and enqueued with job_key_mode => 'replace' on
// balance change once a caller wires that trigger — re-running it early
// just collapses into the same scheduled run rather than duplicating work.
// All the logic lives in public.evaluate_levels_perks()
// (supabase/proposed/scoring/0007_recognition_evaluators.sql).
export const evaluate_levels_perks: Task = async (_payload, helpers) => {
  await helpers.query(`select public.evaluate_levels_perks()`);
  helpers.logger.info("evaluate_levels_perks: ran");
};
