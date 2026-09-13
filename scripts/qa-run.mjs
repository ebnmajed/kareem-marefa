#!/usr/bin/env node
// Runs the QA suite end to end against the STUB, never a real project.
//
// Starts scripts/supabase-stub.mjs, starts `next start` with SUPABASE_URL
// pointed at it, waits for readiness, runs scripts/qa.mjs, tears everything
// down, and exits with the suite's code.
//
// This exists because "start the stub, then start the server" looks sufficient
// and is not: `next start` reads .env.local, so the app talks to the production
// project while the stub sits idle and nothing errors. Overriding the env in
// the same command that starts the server is the only thing that actually
// wires them together.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STUB = `http://localhost:${process.env.STUB_PORT ?? 54331}`
const BASE = 'http://localhost:3000'

if (!existsSync(join(ROOT, '.next'))) {
  console.error('No .next build found. Run `npm run build` first.')
  process.exit(2)
}

const children = []
const spawnChild = (cmd, args, env) => {
  const c = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  })
  children.push(c)
  return c
}
const shutdown = () => {
  for (const c of children) {
    try {
      c.kill('SIGTERM')
    } catch {}
  }
}
process.on('exit', shutdown)
process.on('SIGINT', () => {
  shutdown()
  process.exit(130)
})

async function waitFor(url, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url)
      return true
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  console.error(`${label} did not come up at ${url}`)
  return false
}

console.log(`· starting Supabase stub on ${STUB}`)
spawnChild('node', ['scripts/supabase-stub.mjs'])
if (!(await waitFor(`${STUB}/__stub`, 'stub'))) process.exit(2)

// Assert the thing answering is OUR stub, not whatever else happens to be on
// that port. "Something responded" is not the same as "the stub responded" —
// local Supabase answering on 54321 is exactly how this went wrong before.
try {
  const { marker } = await (await fetch(`${STUB}/__stub`)).json()
  if (marker !== 'kareem-marefa-qa-stub') throw new Error(`got marker ${marker}`)
  console.log('· stub identity confirmed')
} catch (err) {
  console.error(`Something is on ${STUB} but it is not the QA stub: ${err.message}`)
  process.exit(2)
}

console.log('· starting next start on :3000, pointed at the stub')
spawnChild('npx', ['next', 'start'], {
  // The whole point of this file. Without these two lines the app posts
  // registrations to the production project.
  SUPABASE_URL: STUB,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_stub',
})
if (!(await waitFor(`${BASE}/ar`, 'next'))) process.exit(2)

console.log('· running scripts/qa.mjs\n')
const qa = spawnChild('node', ['scripts/qa.mjs'], { SUPABASE_URL: STUB })
qa.stdout.pipe(process.stdout)
qa.stderr.pipe(process.stderr)

qa.on('exit', (code) => {
  shutdown()
  process.exit(code ?? 1)
})
