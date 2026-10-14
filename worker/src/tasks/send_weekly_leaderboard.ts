import type { Task } from "graphile-worker";

// JOB-send_weekly_leaderboard — `REQ-LDR-009`, `DEC-289`. Cron, hourly.
//
// The week runs Sunday 00:00 → the next Sunday 00:00 in each org's own zone (`org_week()`, `0224`), and its close
// is mailed once the org's clock has passed Sunday 08:00. Everything that decides — which orgs are due, who is
// ranked, the rank change, the counts, the top three — happens in `send_weekly_leaderboard_digests()`, which inserts
// the week's guard row BEFORE it notifies, so a retry, an overlapping run or a second worker sends nothing twice.
// Hourly rather than at 08:00, so a worker that was down on Sunday morning catches the week up when it returns.
export const send_weekly_leaderboard: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ sent: number }>(`select public.send_weekly_leaderboard_digests() as sent`);
  const sent = rows[0]?.sent ?? 0;
  if (sent > 0) helpers.logger.info(`send_weekly_leaderboard: ${sent} weekly digests queued`);
};
