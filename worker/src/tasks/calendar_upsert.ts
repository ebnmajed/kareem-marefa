import type { Task } from "graphile-worker";
import { createCalendarApi, CalendarAuthExpired, CalendarNotFound, type CalendarApi } from "../calendar/index.js";

// JOB-calendar_upsert — 11 §2.2, 08 §6.3, REQ-CAL-004, REQ-CAL-005, REQ-CAL-008.
// Key: `cal:{rsvp_id}`, enqueued INSIDE the transaction that confirms the seat
// (migration 0034), so there is no window in which the seat is held and the
// calendar is never going to hear about it.
//
// ★ REQ-CAL-008: failure never blocks. Everything this job can fail at is a
// third-party API call, and the RSVP stands regardless — the worst outcome is
// a `failed` row the member can see on SCR-025 and a retry with backoff.
//
// ★ 08 §6.3: "Promotion creates, it does not update." A waitlisted member has
// no event, so the promotion path inserts one. That falls out of the state
// here rather than needing a flag: no `provider_event_id` means create.
//
// ★ WAVE 9 (REQ-SES-015, DEC-119): ONE ENTRY PER DAY, and the key is still the
// RESERVATION's. The job's subject is «make this member's calendar match the
// truth for this reservation» — it walks the days, creates what is missing,
// updates what moved, and removes what should not be there. A per-day key
// would have left the `cal:{rsvp_id}` jobs already pending in production
// unreplaced, so a second job would be added and the old one would still fire
// (contract 2). At one day `days` has one entry carrying the session's own
// window and venue, so every API call and every log line below is today's.

let api: CalendarApi | null = null;
export function calendarApi(): CalendarApi {
  if (!api) api = createCalendarApi();
  return api;
}
export function setCalendarApi(next: CalendarApi | null) {
  api = next;
}

/** One day of the session, with this member's provider event for it.
 *
 *  `day_id` is null only in the compatibility shape below, where the SQL
 *  resolves it to the session's first day. */
export interface SyncDay {
  day_id: string | null;
  position: number;
  starts_at: string;
  ends_at: string;
  location: string | null;
  provider_event_id: string | null;
  state: string | null;
}

/** A row whose day has been deleted from the session. `0101`'s foreign key is
 *  `on delete set null (session_day_id)`, never cascade, so the row outlives
 *  its day carrying the only record of the provider event id — without it the
 *  event would stay in the member's calendar with nothing left that knows how
 *  to remove it. */
export interface Orphan {
  calendar_event_id: string;
  provider_event_id: string;
}

export interface SyncTarget {
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
  /** Absent when this process is talking to a database that still has `main`'s
   *  `calendar_sync_target()` — the deploy order makes that a moment, not a
   *  state, and `daysOf()` below is what makes the moment harmless. */
  days?: SyncDay[];
  orphans?: Orphan[];
}

/**
 * The days to sync, tolerating the answer `main`'s `calendar_sync_target()`
 * gives: the session's own window, one day, with no id.
 *
 * A null `day_id` is not a special case downstream —
 * `record_calendar_sync(…, null)` resolves it to the session's FIRST day,
 * which is the same resolution `main`'s six-argument call gets (contract 2).
 * So the shim needs no branch anywhere but here.
 */
export function daysOf(target: SyncTarget): SyncDay[] {
  if (Array.isArray(target.days)) return target.days;
  return [
    {
      day_id: null,
      position: 1,
      starts_at: target.session.starts_at ?? "",
      ends_at: target.session.ends_at ?? "",
      location: target.session.location,
      provider_event_id: target.provider_event_id,
      state: null,
    },
  ];
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

  const record = (state: string, eventId: string | null, error: string | null, dayId: string | null) =>
    helpers.query(
      `select public.record_calendar_sync($1::uuid, $2::uuid, $3::uuid, $4::public.calendar_sync_state, $5::text, $6::text, $7::uuid)`,
      [target.org_id, target.member_id, target.session_id, state, eventId, error, dayId],
    );

  // ★ The days first, then what is left over. A failure on one day records
  // that day and rethrows: the days already synced stay synced, and the retry
  // updates them again, which is idempotent by construction.
  for (const day of daysOf(target)) {
    // The title and the description are the SESSION's on every day — a member
    // reading three entries a week apart already has the date to tell them
    // apart, and a generated day label in a calendar entry is one more string
    // to keep in step with the app's.
    const body = {
      summary: target.session.title,
      description: target.session.description,
      location: day.location,
      startsAt: day.starts_at,
      endsAt: day.ends_at,
      timeZone: target.session.time_zone,
    };

    try {
      let eventId = day.provider_event_id;
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
      await record("synced", eventId, null, day.day_id);
      helpers.logger.info(`calendar_upsert: rsvp ${rsvpId} synced as ${eventId}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // REQ-CAL-005: surfaced to the member, not silently dropped. The row is
      // what SCR-025 renders; the throw is what makes graphile-worker retry
      // (11 §1.3: external API, 8 attempts, exponential from 30 s).
      await record("failed", day.provider_event_id, reason.slice(0, 500), day.day_id);
      if (error instanceof CalendarAuthExpired) {
        helpers.logger.error(`calendar_upsert: member ${target.member_id} needs to reconnect their calendar`);
      }
      throw error;
    }
  }

  // A day removed from the session takes its entry out of the member's
  // calendar. Nothing else in the system would ever do this: the row is all
  // that is left of the event.
  for (const orphan of target.orphans ?? []) {
    try {
      await calendarApi().deleteEvent(tokens.access_token, orphan.provider_event_id);
    } catch (error) {
      // Already gone is the outcome this is trying to produce (REQ-CAL-006).
      if (!(error instanceof CalendarNotFound)) throw error;
    }
    await helpers.query(`select public.record_calendar_event_removed($1::uuid)`, [orphan.calendar_event_id]);
    helpers.logger.info(`calendar_upsert: rsvp ${rsvpId} removed ${orphan.provider_event_id} — its day is gone`);
  }
};
