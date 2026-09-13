import type { Task } from "graphile-worker";

// JOB-rotate_check_in_code (11 §2.1, REQ-CHK-002, DEC-015). Scheduled (a
// graphile-worker crontab entry, wired at M3 when the worker is actually
// hosted — OQ-027) to keep a current code issued for every in-progress
// session. public.rotate_check_in_code() is the service_role-only twin of
// ensure_check_in_code() (supabase/proposed/checkin/02_check_in.sql): same
// idempotent "issue a new one only if the current rotation window has
// elapsed" core, no member-identity check — the caller here is the worker
// itself, trusted directly, not a presenter or staff member reading
// through PostgREST.
export const rotate_codes: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ id: string }>(`select id from public.sessions where state = 'in_progress'`);
  for (const { id } of rows) {
    await helpers.query(`select public.rotate_check_in_code($1)`, [id]);
  }
  helpers.logger.info(`rotate_codes: checked ${rows.length} in-progress session(s)`);
};
