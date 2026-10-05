import type { Task } from "graphile-worker";

// JOB-generate_story_frames (REQ-STO-004, DEC-248 §5, DEC-251 §4). Cron, every minute.
//
// The clock writes the story frames no row write marks: registration opening after a priority window, registration
// closing before the start, 24 hours before each day, and a later day of a workshop going live. The other triggers are
// table triggers and need no job. `public.clock_story_frames()` is SECURITY DEFINER and service_role-only, because the
// worker never writes a table directly (CLAUDE.md, data access rule 6).
//
// Idempotency is the table's: `unique (session_id, kind, trigger_key)` and an `on conflict do nothing`, so a second
// run in the same minute — or a retry — writes nothing. The function looks back 24 hours and dates each frame at its
// scheduled instant, so a late run moves no frame's expiry.
export const generate_story_frames: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ written: number }>(`select public.clock_story_frames() as written`);
  const written = rows[0]?.written ?? 0;
  if (written > 0) {
    helpers.logger.info(`generate_story_frames: wrote ${written} frame(s)`);
  }
};
