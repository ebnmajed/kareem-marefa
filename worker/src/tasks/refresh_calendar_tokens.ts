import type { Task } from "graphile-worker";
import { CalendarAuthExpired } from "../calendar/index.js";
import { calendarApi } from "./calendar_upsert.js";

// JOB-refresh_calendar_tokens — 11 §2.2, REQ-CAL-003. Key: `caltok:{connection_id}`.
//
// "The ONLY consumer of the token columns. Nothing else in the system reads
// them" (11 §2.2, 03 §5.9c) — together with calendar_upsert and
// calendar_delete, which reach them through the same one function,
// public.calendar_tokens_for_job().
//
// Hourly cron. With no payload it sweeps every connection whose access token
// expires within the next thirty minutes; with a connection_id it refreshes
// that one. Google's access tokens last an hour, so a sweep that ran only at
// expiry would leave a window in which every sync job fails with a 401.

interface Tokens {
  connection_id: string;
  access_token: string;
  refresh_token: string | null;
}

export const refresh_calendar_tokens: Task = async (payload, helpers) => {
  const memberId = (payload as { member_id?: string } | null)?.member_id;

  const due = memberId
    ? [{ member_id: memberId }]
    : (await helpers.query<{ member_id: string }>(`select member_id from public.calendar_connections_due_refresh()`)).rows;

  let refreshed = 0;
  for (const row of due) {
    const { rows } = await helpers.query<{ tokens: Tokens | null }>(`select public.calendar_tokens_for_job($1::uuid) as tokens`, [row.member_id]);
    const tokens = rows[0]?.tokens;
    if (!tokens?.refresh_token) continue;

    try {
      const next = await calendarApi().refreshAccessToken(tokens.refresh_token);
      await helpers.query(`select public.update_calendar_tokens($1::uuid, $2::text, $3::timestamptz)`, [tokens.connection_id, next.accessToken, next.expiresAt]);
      refreshed++;
    } catch (error) {
      // A revoked grant is not a transient fault and will never succeed. It is
      // logged and skipped rather than thrown, so one member revoking access
      // does not fail the sweep for everyone else — REQ-CAL-008's principle,
      // applied to the maintenance job.
      if (error instanceof CalendarAuthExpired) {
        helpers.logger.error(`refresh_calendar_tokens: connection ${tokens.connection_id} was revoked; the member must reconnect`);
        continue;
      }
      throw error;
    }
  }
  helpers.logger.info(`refresh_calendar_tokens: ${due.length} due, ${refreshed} refreshed`);
};
