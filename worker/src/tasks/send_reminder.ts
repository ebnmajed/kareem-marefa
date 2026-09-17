import type { Task } from "graphile-worker";

// JOB-send_reminder — 11 §2.6, 08 §4.1, REQ-NTF-004.
// Key: `remind:{session}:{offset}:{member}`, scheduled by
// public.schedule_session_reminders() (supabase/proposed/notify/0003).
//
// ★ The key is the mechanism, and it lives in SQL: re-enqueueing it moves the
// job rather than adding one, so a rescheduled session moves its reminders.
// Nothing here participates in that. This task's only job is to fire at the
// moment, and to check that the moment still means something — the reminder
// was queued days ago and the seat or the session may be gone since.
export const send_reminder: Task = async (payload, helpers) => {
  const p = payload as { session_id?: string; member_id?: string; offset_minutes?: number; session_day_id?: string } | null;
  if (!p?.session_id || !p.member_id || typeof p.offset_minutes !== "number") {
    throw new Error("send_reminder: payload needs session_id, member_id and offset_minutes");
  }

  // ★ WAVE 9 (REQ-SES-015): the day is the fourth argument, and it is optional
  // on purpose. A job queued before the migration carries no `session_day_id`,
  // and so does every job `main`'s worker ever enqueued; null resolves to the
  // session's FIRST day, which at one day is the only day (contract 2).
  const { rows } = await helpers.query<{ sent: boolean }>(
    `select public.send_reminder_notification($1::uuid, $2::uuid, $3::int, $4::uuid) as sent`,
    [p.session_id, p.member_id, p.offset_minutes, p.session_day_id ?? null],
  );

  helpers.logger.info(
    rows[0]?.sent
      ? `send_reminder: -${p.offset_minutes} min for session ${p.session_id} sent to member ${p.member_id}`
      : `send_reminder: -${p.offset_minutes} min for session ${p.session_id} no longer applies to member ${p.member_id}`,
  );
};
