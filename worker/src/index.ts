// graphile-worker entry point. 11-background-jobs.md §1, DEC-018, DEC-034.
//
//   DATABASE_URL=postgres://…:5432/postgres node dist/index.js            # run
//   DATABASE_URL=postgres://…:5432/postgres node dist/index.js --probe-only
//
// Boot order is the point of this file: the LISTEN/NOTIFY probe runs BEFORE
// the runner starts, and a failed probe is a failed boot (exit 1). See
// probe.ts for why that is not optional.

import { run } from "graphile-worker";
import { poolerWarning, probeListenNotify, ProbeError } from "./probe.js";
import { ping } from "./tasks/ping.js";
import { promote_waitlist } from "./tasks/promote_waitlist.js";
import { rotate_codes } from "./tasks/rotate_codes.js";
import { start_session } from "./tasks/start_session.js";
import { complete_session } from "./tasks/complete_session.js";
import { award_points } from "./tasks/award_points.js";
import { send_notification } from "./tasks/send_notification.js";
import { award_presenter_points } from "./tasks/award_presenter_points.js";
import { evaluate_no_shows } from "./tasks/evaluate_no_shows.js";
import { audit_balances } from "./tasks/audit_balances.js";
import { send_reminder } from "./tasks/send_reminder.js";
import { rsvp_nudge } from "./tasks/rsvp_nudge.js";
import { rating_prompt } from "./tasks/rating_prompt.js";
import { schedule_reminders } from "./tasks/schedule_reminders.js";

const DATABASE_URL = process.env.DATABASE_URL;
const probeOnly = process.argv.includes("--probe-only");

if (!DATABASE_URL) {
  console.error("worker: DATABASE_URL is not set. It must be a SESSION-mode connection string (port 5432).");
  process.exit(2);
}

const warning = poolerWarning(DATABASE_URL);
if (warning) console.error(`worker: ${warning}`);

try {
  const { latencyMs } = await probeListenNotify(DATABASE_URL, { timeoutMs: 1000 });
  console.log(`worker: LISTEN/NOTIFY probe OK — round trip ${latencyMs} ms`);
} catch (e) {
  if (e instanceof ProbeError) {
    console.error(`worker: REFUSING TO START — ${e.message}`);
    process.exit(1);
  }
  throw e;
}

if (probeOnly) process.exit(0);

const runner = await run({
  connectionString: DATABASE_URL,
  // 11 §1.4 sizes queues separately; graphile-worker's concurrency is per
  // process, so this is the `default` queue's figure. Render and convert get
  // their own processes when M6 and M4 introduce them.
  concurrency: 10,
  // Polling is the FALLBACK, not the mechanism. A long interval keeps it
  // from masking a LISTEN regression: if dispatch ever degrades to polling,
  // jobs visibly wait up to a minute instead of a barely-noticeable 2 s.
  pollInterval: 60_000,
  taskList: { ping, promote_waitlist, rotate_codes, start_session, complete_session, award_points, send_notification, award_presenter_points, evaluate_no_shows, audit_balances, send_reminder, rsvp_nudge, rating_prompt, schedule_reminders },
  // 11 §2.1: the clock runs every minute. Both functions are idempotent and
  // only move forward along 02 §6.2 (migration 0022), so a missed or doubled
  // tick is harmless. Inline rather than a crontab file so the image carries
  // it without a path to get wrong.
  crontab: ["* * * * * start_session", "* * * * * complete_session"].join("\n") + "\n",
});

console.log("worker: running — queues dispatch over LISTEN/NOTIFY; polling every 60 s as a fallback");
await runner.promise;
