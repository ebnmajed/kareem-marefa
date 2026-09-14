import type { Task } from "graphile-worker";

// JOB-rsvp_nudge — 11 §2.6, 08 §4.2. Key: `nudge:{session_id}`.
//
// In-app only, ONCE, at the -7 d mark. §6 of the brief asks for reminders to
// non-responders; once and in-app is the restraint that keeps that from
// becoming the reason people mute the platform. The channel is not this
// task's decision and cannot be: `MSG-rsvp_nudge` carries `email = false` in
// the matrix, so public.notify() would refuse to mail it.
export const rsvp_nudge: Task = async (payload, helpers) => {
  const sessionId = (payload as { session_id?: string } | null)?.session_id;
  if (!sessionId) throw new Error("rsvp_nudge: payload needs session_id");

  const { rows } = await helpers.query<{ nudged: number }>(`select public.send_rsvp_nudge($1::uuid) as nudged`, [sessionId]);
  helpers.logger.info(`rsvp_nudge: session ${sessionId} — ${rows[0]?.nudged ?? 0} non-responder(s) nudged`);
};
