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
  taskList: { ping },
});

console.log("worker: running — queues dispatch over LISTEN/NOTIFY; polling every 60 s as a fallback");
await runner.promise;
