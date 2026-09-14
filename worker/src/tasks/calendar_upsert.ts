import type { Task } from "graphile-worker";
import { createCalendarApi, CalendarAuthExpired, CalendarNotFound, type CalendarApi } from "../calendar/index.js";

// JOB-calendar_upsert — 11 §2.2, 08 §6.3, REQ-CAL-004, REQ-CAL-005, REQ-CAL-008.
// Key: `cal:{rsvp_id}`, enqueued INSIDE the transaction that confirms the seat
// (supabase/proposed/notify/0003), so there is no window in which the seat is
// held and the calendar is never going to hear about it.
//
// ★ REQ-CAL-008: failure never blocks. Everything this job can fail at is a
// third-party API call, and the RSVP stands regardless — the worst outcome is
// a `failed` row the member can see on SCR-025 and a retry with backoff.
//
// ★ 08 §6.3: "Promotion creates, it does not update." A waitlisted member has
// no event, so the promotion path inserts one. That falls out of the state
// here rather than needing a flag: no `provider_event_id` means create.

let api: CalendarApi | null = null;
export function calendarApi(): CalendarApi {
  if (!api) api = createCalendarApi();
  return api;
}
export function setCalendarApi(next: CalendarApi | null) {
  api = next;
}

interface SyncTarget {
  rsvp_id: string;
  org_id: string;
  member_id: string;
  session_id: string;
  rsvp_status: string;
  connected: boolean;
  provider_event_id: string | null;
  session: {
    title: string;
    description: string;
    starts_at: string | null;
    ends_at: string | null;
    time_zone: string;
    state: string;
    cancelled: boolean;
    location: string | null;
  };
}

interface Tokens {
  connection_id: string;
  access_token: string;
  refresh_token: string | null;
}

export const calendar_upsert: Task = async (payload, helpers) => {
  const rsvpId = (payload as { rsvp_id?: string } | null)?.rsvp_id;
  if (!rsvpId) throw new Error("calendar_upsert: payload needs rsvp_id");

  const { rows } = await helpers.query<{ target: SyncTarget | null }>(`select public.calendar_sync_target($1::uuid) as target`, [rsvpId]);
  const target = rows[0]?.target;
  // A cancelled RSVP, a deleted one, or a member who never connected: there is
  // nothing to do and nothing is wrong.
  if (!target) return helpers.logger.info(`calendar_upsert: rsvp ${rsvpId} no longer exists`);
  if (!target.connected) return helpers.logger.info(`calendar_upsert: member ${target.member_id} has no connected calendar`);
  if (target.rsvp_status !== "confirmed" || target.session.cancelled) {
    return helpers.logger.info(`calendar_upsert: rsvp ${rsvpId} is ${target.rsvp_status} on a ${target.session.state} session — nothing to write`);
  }
  if (!target.session.starts_at || !target.session.ends_at) {
    return helpers.logger.info(`calendar_upsert: session ${target.session_id} has no time yet`);
  }

  const { rows: tokenRows } = await helpers.query<{ tokens: Tokens | null }>(`select public.calendar_tokens_for_job($1::uuid) as tokens`, [target.member_id]);
  const tokens = tokenRows[0]?.tokens;
  if (!tokens) return helpers.logger.info(`calendar_upsert: no tokens for member ${target.member_id}`);

  const body = {
    summary: target.session.title,
    description: target.session.description,
    location: target.session.location,
    startsAt: target.session.starts_at,
    endsAt: target.session.ends_at,
    timeZone: target.session.time_zone,
  };

  const record = (state: string, eventId: string | null, error: string | null) =>
    helpers.query(`select public.record_calendar_sync($1::uuid, $2::uuid, $3::uuid, $4::public.calendar_sync_state, $5::text, $6::text)`, [
      target.org_id,
      target.member_id,
      target.session_id,
      state,
      eventId,
      error,
    ]);

  try {
    let eventId = target.provider_event_id;
    if (eventId) {
      try {
        await calendarApi().updateEvent(tokens.access_token, eventId, body);
      } catch (error) {
        // The member deleted it by hand and then the session moved. Recreate
        // rather than dead-letter: they asked for this session to be in their
        // calendar, and REQ-CAL-006's tolerance cuts both ways.
        if (!(error instanceof CalendarNotFound)) throw error;
        eventId = (await calendarApi().createEvent(tokens.access_token, body)).id;
      }
    } else {
      eventId = (await calendarApi().createEvent(tokens.access_token, body)).id;
    }
    await record("synced", eventId, null);
    helpers.logger.info(`calendar_upsert: rsvp ${rsvpId} synced as ${eventId}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // REQ-CAL-005: surfaced to the member, not silently dropped. The row is
    // what SCR-025 renders; the throw is what makes graphile-worker retry
    // (11 §1.3: external API, 8 attempts, exponential from 30 s).
    await record("failed", target.provider_event_id, reason.slice(0, 500));
    if (error instanceof CalendarAuthExpired) {
      helpers.logger.error(`calendar_upsert: member ${target.member_id} needs to reconnect their calendar`);
    }
    throw error;
  }
};
