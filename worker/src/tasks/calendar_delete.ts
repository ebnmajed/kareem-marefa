import type { Task } from "graphile-worker";
import { CalendarNotFound } from "../calendar/index.js";
import { calendarApi, daysOf, type SyncDay, type SyncTarget } from "./calendar_upsert.js";

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
//
// ★ WAVE 9 (REQ-SES-015): every day's entry goes, and so does every entry
// whose day was already deleted from the session. The key stays the
// RESERVATION's, because one حجز covers every day (DEC-120) and cancelling it
// empties the whole workshop out of the member's calendar. At one day there is
// one entry, one API call, and the same log line as today.

export const calendar_delete: Task = async (payload, helpers) => {
  const rsvpId = (payload as { rsvp_id?: string } | null)?.rsvp_id;
  if (!rsvpId) throw new Error("calendar_delete: payload needs rsvp_id");

  const { rows } = await helpers.query<{ target: SyncTarget | null }>(`select public.calendar_sync_target($1::uuid) as target`, [rsvpId]);
  const target = rows[0]?.target;
  if (!target) return helpers.logger.info(`calendar_delete: rsvp ${rsvpId} no longer exists`);

  // Every entry this reservation ever put in the member's calendar: one per
  // day that was synced, plus the ones whose day has since been deleted.
  const orphans = target.orphans ?? [];
  const synced = daysOf(target).filter((d): d is SyncDay & { provider_event_id: string } => Boolean(d.provider_event_id));
  if (synced.length === 0 && orphans.length === 0) {
    return helpers.logger.info(`calendar_delete: rsvp ${rsvpId} was never synced`);
  }

  // The same seven positional arguments as `calendar_upsert`'s, so the day is
  // always the seventh wherever this function is called from.
  const recordDay = (state: string, error: string | null, dayId: string | null) =>
    helpers.query(
      `select public.record_calendar_sync($1::uuid, $2::uuid, $3::uuid, $4::public.calendar_sync_state, $5::text, $6::text, $7::uuid)`,
      [target.org_id, target.member_id, target.session_id, state, null, error, dayId],
    );
  const recordOrphan = (eventRow: string) => helpers.query(`select public.record_calendar_event_removed($1::uuid)`, [eventRow]);

  if (!target.connected) {
    // Disconnected between the cancellation and this job. The tokens are gone
    // (REQ-CAL-007) and the events stay where they are, which is what the
    // member was told would happen.
    for (const day of synced) await recordDay("removed", null, day.day_id);
    for (const orphan of orphans) await recordOrphan(orphan.calendar_event_id);
    return helpers.logger.info(`calendar_delete: member ${target.member_id} disconnected; event left in place`);
  }

  const { rows: tokenRows } = await helpers.query<{ tokens: { access_token: string } | null }>(
    `select public.calendar_tokens_for_job($1::uuid) as tokens`,
    [target.member_id],
  );
  const tokens = tokenRows[0]?.tokens;
  if (!tokens) {
    for (const day of synced) await recordDay("removed", null, day.day_id);
    for (const orphan of orphans) await recordOrphan(orphan.calendar_event_id);
    return;
  }

  for (const day of synced) {
    try {
      await calendarApi().deleteEvent(tokens.access_token, day.provider_event_id);
      await recordDay("removed", null, day.day_id);
      helpers.logger.info(`calendar_delete: rsvp ${rsvpId} removed from the calendar`);
    } catch (error) {
      if (error instanceof CalendarNotFound) {
        // Already gone. That is the outcome this job exists to produce.
        await recordDay("removed", null, day.day_id);
        helpers.logger.info(`calendar_delete: rsvp ${rsvpId} was already absent — success (REQ-CAL-006)`);
        continue;
      }
      const reason = error instanceof Error ? error.message : String(error);
      await recordDay("failed", reason.slice(0, 500), day.day_id);
      throw error;
    }
  }

  for (const orphan of orphans) {
    try {
      await calendarApi().deleteEvent(tokens.access_token, orphan.provider_event_id);
    } catch (error) {
      if (!(error instanceof CalendarNotFound)) throw error;
    }
    await recordOrphan(orphan.calendar_event_id);
  }
};
