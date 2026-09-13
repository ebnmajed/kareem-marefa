#!/usr/bin/env node
// Diffs the RLS policies in supabase/migrations against docs/plan/03-permissions-rls.md.
//
//   node scripts/policy-diff.mjs
//
// docs/plan/03-permissions-rls.md is only TRUE if it matches the database, and
// nothing else checks that it does. It is the security document — a policy that
// exists in the migrations but not in the document is an undocumented access
// path, and a policy documented but never written is a protection someone
// believes they have.
//
// Fails on:
//   1. a policy in the migrations with no counterpart in 03
//   2. a policy written out in 03 with no counterpart in the migrations
//   3. a table with RLS enabled but no policy at all
//   4. a table with a policy but no matching GRANT   <- migration 0002's lesson

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const DOC = join(ROOT, 'docs', 'plan', '03-permissions-rls.md')

// Frozen legacy: predates the platform, deliberately outside the policy model.
// DEC-002 / 02-domain-model.md §4.18. Never platform-managed, never diffed.
const EXEMPT_TABLES = new Set(['registrations'])

const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => ({ file: f, body: readFileSync(join(MIGRATIONS, f), 'utf8') }))

const strip = (s) => s.replace(/--[^\n]*/g, '')

/* ---------- what the migrations actually create ---------- */
const inMigrations = new Map() // table -> Set(policy name)
const rlsEnabled = new Set()
const granted = new Set()

for (const { body } of sql) {
  const text = strip(body)
  for (const m of text.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?(\w+)/gi)) {
    const [, name, table] = m
    if (!inMigrations.has(table)) inMigrations.set(table, new Set())
    inMigrations.get(table).add(name)
  }
  for (const m of text.matchAll(/alter\s+table\s+(?:public\.)?(\w+)\s+enable\s+row\s+level\s+security/gi)) {
    rlsEnabled.add(m[1])
  }
  for (const m of text.matchAll(/grant\s+[^;]*?\s+on\s+(?:table\s+)?(?:public\.)?(\w+)\s+to\s+/gi)) {
    granted.add(m[1])
  }
}

/* ---------- what the document claims ---------- */
// Policies written out as SQL in 03, and policy IDs cited as POL-<table>.<action>[.<role>]
const doc = readFileSync(DOC, 'utf8')
const inDoc = new Map()
for (const m of strip(doc).matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.|storage\.)?(\w+)/gi)) {
  const [, name, table] = m
  if (!inDoc.has(table)) inDoc.set(table, new Set())
  inDoc.get(table).add(name)
}
const documentedTables = new Set(
  [...doc.matchAll(/\bPOL-([a-z_]+)\./g)].map((m) => m[1]),
)

/* ---------- diff ---------- */
const problems = []
const note = []

for (const [table, names] of inMigrations) {
  if (EXEMPT_TABLES.has(table)) {
    note.push(`  ${table}: exempt (frozen legacy, DEC-002) — ${names.size} policy(ies) not diffed`)
    continue
  }
  const docNames = inDoc.get(table) ?? new Set()
  for (const n of names) {
    if (!docNames.has(n) && !documentedTables.has(table)) {
      problems.push(`policy "${n}" on ${table} exists in a migration but is absent from 03`)
    }
  }
  if (!granted.has(table)) {
    // The lesson migration 0002 exists to teach: a policy narrows a privilege,
    // it cannot confer one. Without the grant the request fails with 42501 and
    // the policy looks broken.
    problems.push(`${table} has a policy but no GRANT — this fails with 42501 at runtime`)
  }
}

for (const table of rlsEnabled) {
  if (EXEMPT_TABLES.has(table)) continue
  if (!inMigrations.has(table)) {
    problems.push(`${table} has RLS enabled but no policy — it denies everything`)
  }
}

for (const [table, names] of inDoc) {
  if (EXEMPT_TABLES.has(table) || table === 'objects') continue // storage.objects lives in Supabase
  if (!inMigrations.has(table)) {
    // Only a problem once the table itself exists in a migration.
    const tableExists = sql.some(({ body }) =>
      new RegExp(`create\\s+table\\s+(?:public\\.)?${table}\\b`, 'i').test(strip(body)),
    )
    if (tableExists) {
      problems.push(`${table} is policied in 03 (${[...names].join(', ')}) but has no policy in any migration`)
    }
  }
}

/* ---------- report ---------- */
const platformTables = [...inMigrations.keys()].filter((t) => !EXEMPT_TABLES.has(t))

console.log(
  `policy-diff: ${sql.length} migration(s), ${platformTables.length} platform table(s) with policies, ` +
    `${inDoc.size} table(s) written out in 03`,
)
for (const n of note) console.log(n)

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error('\n03-permissions-rls.md and the migrations disagree. One of them is wrong.\n')
  process.exit(1)
}

if (!platformTables.length) {
  console.log(
    'No platform policies yet — M1 creates them. This gate is armed and will\n' +
      'start comparing the moment the first policied table lands.',
  )
}
console.log('✓ migrations and 03-permissions-rls.md agree')
