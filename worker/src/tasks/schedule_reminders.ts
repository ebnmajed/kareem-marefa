import type { Task } from "graphile-worker";

// JOB-schedule_reminders — 11 §2.6, 08 §4.1. Key: `sched:{session_id}`.
//
// The reconciliation entry point. The common paths do NOT go through it:
// reserving a seat, cancelling one and rescheduling a session all call
// public.schedule_session_reminders() inline, in the transaction that made
// the change, because a queued job runs later and a member who reserves ten
// minutes before the -2 h mark would miss their own reminder.
//
// This exists for the paths with no transaction to hang off — an admin
// changing `org_settings.reminder_offsets_minutes`, which moves every pending
// key in the org, and any sweep after a queue outage. With no session_id it
// walks every published session; the function is idempotent by construction
// (the keys replace), so running it over everything is safe at any time.
export const schedule_reminders: Task = async (payload, helpers) => {
  const sessionId = (payload as { session_id?: string } | null)?.session_id;

  const sessionIds = sessionId
    ? [sessionId]
    : (await helpers.query<{ id: string }>(`select id from public.sessions where state in ('published', 'in_progress')`)).rows.map((r) => r.id);

  let scheduled = 0;
  for (const id of sessionIds) {
    const { rows } = await helpers.query<{ schedule_session_reminders: number }>(`select public.schedule_session_reminders($1::uuid)`, [id]);
    scheduled += rows[0]?.schedule_session_reminders ?? 0;
  }
  helpers.logger.info(`schedule_reminders: ${sessionIds.length} session(s), ${scheduled} reminder(s) pending`);
};
