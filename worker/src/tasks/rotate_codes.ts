import type { Task } from "graphile-worker";

// JOB-rotate_check_in_code (11 §2.1, REQ-CHK-002, DEC-015, DEC-119, DEC-151).
// Scheduled, to keep a current code issued for every meeting that is taking
// attendance. `public.rotate_check_in_code()` is the service_role-only twin of
// `ensure_check_in_code()`: the same idempotent "issue a new one only if the
// current rotation window has elapsed" core, no member-identity check — the
// caller here is the worker itself, trusted directly, not a presenter reading
// through PostgREST.
//
// ★ IT ROTATES DAYS, NOT SESSIONS. A three-day workshop is `in_progress` from
// day 1's start to day 3's end — `sessions.starts_at`/`ends_at` are the stored
// shadow of the day set (DEC-150 contract 1) — so a session-shaped query mints
// a fresh code every rotation through two NIGHTS, for a room nobody is in.
// The day's own window answers it: `starts_at` to `check_in_ceiling(d.id)`,
// the lead's one definition of when a day stops taking attendance (0101),
// called and never copied.
//
// ★ NAMED DIFFERENCE 1 (DEC-151, approved at sync 1). At one day this is not
// quite what `main` does, and the difference is a FIX rather than a
// regression: `main` rotates for every `in_progress` session regardless of the
// clock, so a session the clock job failed to complete keeps minting codes
// forever — `_issue_check_in_code()` has no window gate of its own, only
// `ensure_check_in_code()` does. With the day's window it stops at the ceiling,
// which is REQ-CHK-016's "absolutely". Nothing in the suite asserted the old
// behaviour; `tests/unit/checkin-rotate-codes-days.test.ts` asserts the new one.
export const rotate_codes: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ session_id: string; day_id: string }>(
    `select d.session_id, d.id as day_id
       from public.session_days d
       join public.sessions s on s.id = d.session_id
      where s.state = 'in_progress'
        and now() >= d.starts_at
        and now() <  public.check_in_ceiling(d.id)
      order by d.starts_at`,
  );
  for (const { session_id, day_id } of rows) {
    await helpers.query(`select public.rotate_check_in_code($1, $2)`, [session_id, day_id]);
  }
  helpers.logger.info(`rotate_codes: checked ${rows.length} day(s) taking attendance`);
};
