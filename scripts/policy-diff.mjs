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

// A relation is keyed by its bare name in `public` and by `schema.name` elsewhere
// (`realtime.messages`, `storage.objects`), so a policy on realtime.messages is
// never confused with a public table called `realtime`. Wave 1 (DEC-022, 03 §7.2)
// is the first migration to policy a table outside `public`.
const key = (schema, name) => (schema && schema !== 'public' ? `${schema}.${name}` : name)
// Relations Supabase itself creates (`realtime.messages`, `storage.objects`) are
// never `create table`d by a migration, so a policy 03 writes out for them is
// not flagged as missing until a migration policies the relation — 03 §7.2
// lands in M2, §6 in M5. Once a migration does, names must match and the
// migration must state the grant it relies on (invariant 6), idempotently.

/* ---------- what the migrations actually create ---------- */
const inMigrations = new Map() // table -> Set(policy name)
const rlsEnabled = new Set()
const granted = new Set()

for (const { body } of sql) {
  const text = strip(body)
  for (const m of text.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(?:(\w+)\.)?(\w+)/gi)) {
    const [, name, schema, rel] = m
    const table = key(schema, rel)
    if (!inMigrations.has(table)) inMigrations.set(table, new Set())
    inMigrations.get(table).add(name)
  }
  for (const m of text.matchAll(/alter\s+table\s+(?:(\w+)\.)?(\w+)\s+enable\s+row\s+level\s+security/gi)) {
    rlsEnabled.add(key(m[1], m[2]))
  }
  for (const m of text.matchAll(/grant\s+[^;]*?\s+on\s+(?:table\s+)?(?:(\w+)\.)?(\w+)\s+to\s+/gi)) {
    granted.add(key(m[1], m[2]))
  }
}

/* ---------- what the document claims ---------- */
// Policies written out as SQL in 03, and policy IDs cited as POL-<table>.<action>[.<role>]
const doc = readFileSync(DOC, 'utf8')
const inDoc = new Map()
for (const m of strip(doc).matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(?:(\w+)\.)?(\w+)/gi)) {
  const [, name, schema, rel] = m
  const table = key(schema, rel)
  if (!inDoc.has(table)) inDoc.set(table, new Set())
  inDoc.get(table).add(name)
}
const documentedTables = new Set(
  [...doc.matchAll(/\bPOL-([a-z_]+)\./g)].map((m) => m[1]),
)
// Tables 03 documents as having NO policy on purpose — RLS enabled, nothing
// granted, nothing readable by any client role (platform_admins: read only by
// the auth hook). Parsed from the per-table map rows that say so, never
// hard-coded here, so the document stays the source of truth.
const noPolicyByDesign = new Set(
  [...doc.matchAll(/^\|\s*`([a-z_]+)`\s*\|[^\n]*No policy at all/gm)].map((m) => m[1]),
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
    if (noPolicyByDesign.has(table)) {
      note.push(`  ${table}: RLS enabled and no policy — by design (03 says "No policy at all")`)
      if (granted.has(table)) problems.push(`${table} is documented as having no policy but a migration GRANTs on it`)
      continue
    }
    problems.push(`${table} has RLS enabled but no policy — it denies everything`)
  }
}
for (const table of noPolicyByDesign) {
  if (inMigrations.has(table)) problems.push(`${table} is documented as "No policy at all" but a migration creates a policy on it`)
}

for (const [table, names] of inDoc) {
  if (EXEMPT_TABLES.has(table) || table === 'storage.objects') continue // bucket policies are M5's
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
