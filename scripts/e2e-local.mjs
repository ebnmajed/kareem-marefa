#!/usr/bin/env node
// Runs the Playwright suite INCLUDING the signed-in specs, which need real
// local Supabase (`supabase start`). Reads the local keys from the CLI and
// hands them to the tests; nothing here can reach a hosted project.
//
//   npm run build && npm run test:e2e:local
//
// The build must have been made with .env.local pointing NEXT_PUBLIC_* at
// local Supabase — those values are inlined at build time.

import { execFileSync, spawnSync } from 'node:child_process'

let env
try {
  env = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
} catch {
  console.error('local Supabase is not running — `supabase start` first')
  process.exit(2)
}
const get = (k) => env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1]
const url = get('API_URL')
const service = get('SERVICE_ROLE_KEY')
const publishable = get('PUBLISHABLE_KEY') ?? get('ANON_KEY')
const db = get('DB_URL')
if (!url || !service || !publishable) {
  console.error('could not read the local keys from `supabase status`')
  process.exit(2)
}
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error(`refusing: ${url} is not local`)
  process.exit(2)
}
const r = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    E2E_SUPABASE_URL: url,
    E2E_SUPABASE_SERVICE_KEY: service,
    E2E_SUPABASE_PUBLISHABLE_KEY: publishable,
    RLS_DATABASE_URL: process.env.RLS_DATABASE_URL ?? db,
  },
})
process.exit(r.status ?? 1)
