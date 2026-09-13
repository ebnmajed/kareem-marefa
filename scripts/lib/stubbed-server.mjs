// Starts the QA stub and `next start` wired to it — the ONLY way this repo
// serves the app for automated tests. Shared by qa-run.mjs, visual-diff.mjs,
// and serve-stub.mjs (Playwright's webServer).
//
// This exists because "start the stub, then start the server" looks sufficient
// and is not: `next start` reads .env.local, so the app talks to the production
// project while the stub sits idle and nothing errors (DEC-023). Overriding the
// env in the same command that starts the server is the only thing that
// actually wires them together, and asserting the thing on the stub port IS
// our stub is the only thing that stops local Supabase answering instead.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const STUB = `http://localhost:${process.env.STUB_PORT ?? 54331}`
export const BASE = 'http://localhost:3000'
export const STUB_MARKER = 'kareem-marefa-qa-stub'

export async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url)
      return true
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  return false
}

/**
 * Starts both processes and resolves once `/ar` answers. Exits the process
 * with code 2 on any failure — there is no sensible way to continue.
 *
 * @returns {{ spawnChild: Function, shutdown: () => void }}
 */
export async function startStubbedServer({ log = console.log } = {}) {
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
  process.on('SIGTERM', () => {
    shutdown()
    process.exit(143)
  })

  log(`· starting Supabase stub on ${STUB}`)
  spawnChild('node', ['scripts/supabase-stub.mjs'])
  if (!(await waitFor(`${STUB}/__stub`))) {
    console.error(`stub did not come up at ${STUB}`)
    process.exit(2)
  }
  try {
    const { marker } = await (await fetch(`${STUB}/__stub`)).json()
    if (marker !== STUB_MARKER) throw new Error(`got marker ${marker}`)
    log('· stub identity confirmed')
  } catch (err) {
    console.error(`Something is on ${STUB} but it is not the QA stub: ${err.message}`)
    process.exit(2)
  }

  log('· starting next start on :3000, pointed at the stub')
  spawnChild('npx', ['next', 'start'], {
    // The whole point of this file. Without these two lines the app posts
    // registrations to the production project.
    SUPABASE_URL: STUB,
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_stub',
    // anti-spam.ts THROWS when this is unset, which takes the register page's
    // render down with it. Locally .env.local hides that; CI has no .env.local.
    FORM_TOKEN_SECRET: process.env.FORM_TOKEN_SECRET ?? 'qa-stub-secret-not-used-in-production',
    // The platform's variables are inlined by `next build`, so these only
    // matter to server code that reads them at runtime (proxy's refresh).
    // Default them to the stub so nothing platform-side can reach a real
    // project from a QA run either.
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? STUB,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_stub',
  })
  if (!(await waitFor(`${BASE}/ar`))) {
    console.error(`next did not come up at ${BASE}`)
    process.exit(2)
  }

  return { spawnChild, shutdown }
}
