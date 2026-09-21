// The RLS runner's lock — one suite on the one local database at a time.
//
// Every RLS case runs in a transaction that is rolled back, but two RUNNERS on
// one database still collide: their fixtures touch the same rows, and the loser
// fails unrelated files at the one-second lock timeout — which looks exactly
// like a regression. Waves 1, 2, 9 and 10 each lost runs to it, and the rule
// «run `pgrep` first» depended on every agent reading the output BEFORE
// launching; three of five did not, in one afternoon (wave 10, sync 1).
//
// So it is a lock and not a rule. This is vitest's `globalSetup` for the `rls`
// project, which means it holds for EVERY way the suite is started —
// `npm run test:rls`, a single file through `npx vitest run --project rls …`,
// an editor's runner — and not only for the npm script.
//
// Same semantics as `scripts/lib/gate-lock.mjs` (DEC-030), on its own
// directory so an RLS run never queues behind a five-minute `qa`:
//   · the lock is a directory, created atomically with mkdir;
//   · a holder whose process is gone is swept; so is one older than 30 minutes;
//   · a waiter says so once, and gives up after 20 minutes and proceeds —
//     degraded, never blocked forever.
// CI has one runner per job and takes it uncontended.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCK = process.env.KAREEM_RLS_LOCK ?? "/tmp/kareem-rls.lock";
const STALE_MS = 30 * 60 * 1000;
const WAIT_MS = 20 * 60 * 1000;
const STEP_MS = 2000;

function holderAlive(): boolean {
  try {
    const pid = Number(readFileSync(join(LOCK, "pid"), "utf8").trim());
    if (!pid) return false;
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // alive, not ours
  }
}

function sweepStale() {
  try {
    const age = Date.now() - statSync(LOCK).mtimeMs;
    if (!holderAlive() || age > STALE_MS) rmSync(LOCK, { recursive: true, force: true });
  } catch {
    // no lock to sweep
  }
}

export default async function setup(): Promise<() => void> {
  sweepStale();
  const started = Date.now();
  let announced = false;
  while (Date.now() - started < WAIT_MS) {
    try {
      mkdirSync(LOCK);
      writeFileSync(join(LOCK, "pid"), String(process.pid));
      const release = () => {
        try {
          // Only our own lock: a run that gave up waiting must not free another's.
          if (Number(readFileSync(join(LOCK, "pid"), "utf8").trim()) === process.pid) rmSync(LOCK, { recursive: true, force: true });
        } catch {
          // already gone
        }
      };
      process.once("exit", release);
      return release;
    } catch {
      if (!announced) {
        console.log(`· rls: another RLS run holds ${LOCK} — waiting for it (one suite on the local database at a time)`);
        announced = true;
      }
      await new Promise((r) => setTimeout(r, STEP_MS));
      sweepStale();
    }
  }
  console.warn(`· rls: waited 20 minutes for ${LOCK}; proceeding WITHOUT it — expect collisions`);
  return () => {};
}
