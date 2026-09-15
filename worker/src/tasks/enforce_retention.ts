import type { Task } from "graphile-worker";

// JOB-enforce_retention (11 §2.7, REQ-NFR-012, 12 §5.3). Nightly, key
// `retain:{date}`.
//
// ★ THE PERIODS ARE ROWS, NOT CONSTANTS. `public.enforce_retention()` reads
// `public.retention_periods`, which was seeded from 12 §5.3, and this task
// carries no number at all. A period written into a task is a policy nobody
// can review and nobody can change without a deploy.
//
// Idempotent by construction: every sweep deletes by an age predicate, so a
// second run in the same window finds nothing left (11 §1.3).
//
// It never trims `points_ledger` — that class is a `retain` row in the table,
// so the exemption is visible rather than inferred from an absence, and the
// summary says so out loud.
export const enforce_retention: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ summary: Record<string, number | string> }>(
    `select public.enforce_retention() as summary`,
  );
  helpers.logger.info(`enforce_retention: ${JSON.stringify(rows[0].summary)}`);
};
