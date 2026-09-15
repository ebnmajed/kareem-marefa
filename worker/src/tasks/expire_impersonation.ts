import type { Task } from "graphile-worker";

// JOB-expire_impersonation (11 §2.7, REQ-ADM-002). Key `impexp:{session_id}`,
// scheduled by `start_impersonation()` AT the session's `expires_at`.
//
// ★ It expires EVERY due session, not only the one its payload names. A job
// that ended one session would leave a missed schedule — a worker restart, a
// queue that stalled for ten minutes — as a break-glass session that outlives
// its window, which is precisely the thing REQ-ADM-002 forbids ("expires on
// its own and cannot be silently extended"). Expiring the whole due set makes
// every run self-healing and every replay a no-op.
//
// The audit row lands in THAT ORG'S own log, like the start and the stop.
export const expire_impersonation: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ n: number }>(`select public.expire_impersonation_sessions() as n`);
  if (rows[0].n > 0) helpers.logger.info(`expire_impersonation: ended ${rows[0].n} expired session(s)`);
};
