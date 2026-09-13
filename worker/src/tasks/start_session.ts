import type { Task } from "graphile-worker";

// JOB-start_session (11 §2.1, REQ-SES-004, A6). Cron, every minute.
//
// The clock moves sessions, not people. `public.clock_start_sessions()` is
// SECURITY DEFINER and service_role-only, because the worker never writes a
// table directly (CLAUDE.md, data access rule 6) — and because the move has to
// happen in one transaction with its `session_state_transitions` row, or the
// audit trail can disagree with the sessions table.
//
// Idempotency is structural rather than a key: the function's own `where
// state = 'published'` means a second run in the same minute finds nothing to
// move. `11` §2.1's `start:{session_id}` key is therefore belt and braces, and
// this task is safe to run at any frequency.
//
// The first رمز الحضور is `checkin`'s to issue (REQ-CHK-002, DEC-015), so this
// enqueues `rotate_codes` per started session rather than reaching into
// `check_in_codes`. Enqueued in the same transaction as nothing — graphile
// gives each `add_job` its own — so a lost code job is recoverable by running
// `rotate_codes` again, which is idempotent per window.
export const start_session: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ session_id: string }>(`select public.clock_start_sessions() as session_id`);

  for (const row of rows) {
    await helpers.addJob("rotate_codes", { session_id: row.session_id }, { jobKey: `code:${row.session_id}:first` });
  }

  if (rows.length > 0) {
    helpers.logger.info(`start_session: moved ${rows.length} session(s) to in_progress`);
  }
};
