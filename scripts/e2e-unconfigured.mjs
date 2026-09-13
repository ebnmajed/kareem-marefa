#!/usr/bin/env node
// Proves DEC-038: build with the platform's NEXT_PUBLIC_ Supabase variables
// EMPTY (overriding .env.local), then run the Playwright suite with the
// served app also seeing them empty. The unconfigured spec runs; the
// signed-in spec skips itself. Leaves .next as the unconfigured build —
// run `npm run build` again before the configured suites.
//
//   npm run test:e2e:unconfigured

import { spawnSync } from 'node:child_process'

const empty = { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, ...empty } })
if (build.status !== 0) process.exit(build.status ?? 1)
const test = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ...empty, E2E_PLATFORM_UNCONFIGURED: '1' },
})
process.exit(test.status ?? 1)
