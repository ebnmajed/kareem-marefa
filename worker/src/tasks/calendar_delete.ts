import type { Task } from "graphile-worker";
import { CalendarNotFound } from "../calendar/index.js";
import { calendarApi } from "./calendar_upsert.js";

// JOB-calendar_delete — 11 §2.2, REQ-CAL-006, REQ-CAL-008.
// Key: `caldel:{rsvp_id}`.
//
// ★ "A 404 from Google on delete is SUCCESS, not an error" (11 §2.2,
// REQ-CAL-006). The member may have deleted the event by hand, and the job's
// goal — the event is not in their calendar — is already true. Treating it as
// a failure would retry eight times and dead-letter over an accomplished fact.
//
// Shares the API instance with calendar_upsert so a test that swaps the stub
// swaps it for both.

interface SyncTarget {
  org_id: string;
  member_id: string;
  session_id: string;
  connected: boolean;
  provider_event_id: string | null;
}

export const calendar_delete: Task = async (payload, helpers) => {
  const rsvpId = (payload as { rsvp_id?: string } | null)?.rsvp_id;
  if (!rsvpId) throw new Error("calendar_delete: payload needs rsvp_id");

  const { rows } = await helpers.query<{ target: SyncTarget | null }>(`select public.calendar_sync_target($1::uuid) as target`, [rsvpId]);
  const target = rows[0]?.target;
  if (!target) return helpers.logger.info(`calendar_delete: rsvp ${rsvpId} no longer exists`);
  if (!target.provider_event_id) return helpers.logger.info(`calendar_delete: rsvp ${rsvpId} was never synced`);

  const record = (state: string, error: string | null) =>
    helpers.query(`select public.record_calendar_sync($1::uuid, $2::uuid, $3::uuid, $4::public.calendar_sync_state, null, $5::text)`, [
      target.org_id,
      target.member_id,
      target.session_id,
      state,
      error,
    ]);

  if (!target.connected) {
    // Disconnected between the cancellation and this job. The tokens are gone
    // (REQ-CAL-007) and the event stays where it is, which is what the member
    // was told would happen.
    await record("removed", null);
    return helpers.logger.info(`calendar_delete: member ${target.member_id} disconnected; event left in place`);
  }

  const { rows: tokenRows } = await helpers.query<{ tokens: { access_token: string } | null }>(
    `select public.calendar_tokens_for_job($1::uuid) as tokens`,
    [target.member_id],
  );
  const tokens = tokenRows[0]?.tokens;
  if (!tokens) {
    await record("removed", null);
    return;
  }

  try {
    await calendarApi().deleteEvent(tokens.access_token, target.provider_event_id);
    await record("removed", null);
    helpers.logger.info(`calendar_delete: rsvp ${rsvpId} removed from the calendar`);
  } catch (error) {
    if (error instanceof CalendarNotFound) {
      // Already gone. That is the outcome this job exists to produce.
      await record("removed", null);
      return helpers.logger.info(`calendar_delete: rsvp ${rsvpId} was already absent — success (REQ-CAL-006)`);
    }
    const reason = error instanceof Error ? error.message : String(error);
    await record("failed", reason.slice(0, 500));
    throw error;
  }
};
