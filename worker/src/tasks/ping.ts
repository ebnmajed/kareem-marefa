import type { Task } from "graphile-worker";

// The first task, and a deliberately trivial one: it proves a job enqueued
// from SQL — `select graphile_worker.add_job('ping', '{"hello":"world"}')` —
// reaches a running worker over LISTEN/NOTIFY. Real jobs arrive with the
// milestones that need them (11 §2); each is a file in this folder named
// after its snake_case job name.
export const ping: Task = async (payload, helpers) => {
  helpers.logger.info(`ping ${JSON.stringify(payload)}`);
};
