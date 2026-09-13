#!/usr/bin/env node
// Runs the QA suite end to end against the STUB, never a real project.
//
// Starts scripts/supabase-stub.mjs, starts `next start` with SUPABASE_URL
// pointed at it, waits for readiness, runs scripts/qa.mjs, tears everything
// down, and exits with the suite's code. The wiring lives in
// scripts/lib/stubbed-server.mjs and is shared with the visual diff and
// Playwright, so there is one place that knows how to do this safely.

import { startStubbedServer, STUB } from './lib/stubbed-server.mjs'

const { spawnChild, shutdown } = await startStubbedServer()

console.log('· running scripts/qa.mjs\n')
const qa = spawnChild('node', ['scripts/qa.mjs'], { SUPABASE_URL: STUB })
qa.stdout.pipe(process.stdout)
qa.stderr.pipe(process.stderr)

qa.on('exit', (code) => {
  shutdown()
  process.exit(code ?? 1)
})
