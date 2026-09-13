// The gate lock. DEC-030 (the TaskCompleted hook), DEC-040 (the agent team).
//
// One checkout, one port 3000, one .next, one local Supabase — and several
// agents. Anything that boots the app or drives the shared database through
// the browser takes this lock first: npm run qa, npm run visual, Playwright's
// web server, the unconfigured build-and-test, and the TaskCompleted hook
// (.claude/hooks/task-gate.sh), which uses the SAME directory as its mutex.
//
// Semantics match the hook exactly, so the two never disagree:
//   · the lock is a directory, created atomically with mkdir;
//   · a holder older than 30 minutes is presumed dead and swept;
//   · a waiter gives up after 20 minutes and proceeds anyway — degraded,
//     never blocked forever (DEC-030 gotcha 2);
//   · the lock is released on normal exit and on SIGINT/SIGTERM.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const GATE_LOCK = process.env.KAREEM_GATE_LOCK ?? '/tmp/task-gate.lock'
const STALE_MS = 30 * 60 * 1000
const WAIT_MS = 20 * 60 * 1000
const STEP_MS = 5000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A lock is stale when its holder is gone (Playwright SIGKILLs its web
// server, so exit handlers never run) or when it is older than 30 minutes
// with no readable holder. The holder's PID lives in <lock>/pid.
function holderAlive() {
  try {
    const pid = Number(readFileSync(join(GATE_LOCK, 'pid'), 'utf8').trim())
    if (!pid) return false
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e && e.code === 'EPERM' // alive, not ours
  }
}
function sweepStale() {
  try {
    const age = Date.now() - statSync(GATE_LOCK).mtimeMs
    if (!holderAlive() || age > STALE_MS) rmSync(GATE_LOCK, { recursive: true, force: true })
  } catch {}
}

/**
 * Acquires the gate. Resolves with a release function. Logs while waiting so
 * a teammate knows why nothing is happening.
 */
export async function acquireGate(label = 'gate') {
  if (process.env.KAREEM_GATE_HELD === '1') return () => {} // a parent process holds it
  sweepStale()
  const started = Date.now()
  let announced = false
  while (Date.now() - started < WAIT_MS) {
    try {
      mkdirSync(GATE_LOCK)
      writeFileSync(join(GATE_LOCK, 'pid'), String(process.pid))
      const release = () => {
        try {
          rmSync(GATE_LOCK, { recursive: true, force: true })
        } catch {}
      }
      process.once('exit', release)
      for (const sig of ['SIGINT', 'SIGTERM']) {
        process.once(sig, () => {
          release()
          process.exit(sig === 'SIGINT' ? 130 : 143)
        })
      }
      return release
    } catch {
      if (!announced) {
        console.log(`· ${label}: waiting for the gate lock (${GATE_LOCK}) — another qa/visual/e2e run or the task gate holds it`)
        announced = true
      }
      await sleep(STEP_MS)
      sweepStale() // the holder may have died while we waited
    }
  }
  console.warn(`· ${label}: gave up waiting for the gate after 20 minutes — proceeding UNSERIALIZED`)
  return () => {}
}
