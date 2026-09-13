#!/usr/bin/env node
// Regenerates docs/plan/TRACEABILITY.md between markers and fails on four gap
// reports. A CI gate on docs/plan/** is the only mechanism in the plan's
// cross-session protocol that actually holds; everything else is etiquette.
//
//   node scripts/traceability.mjs          # regenerate + check
//   node scripts/traceability.mjs --check  # check only, never writes
//
// Exits non-zero on:
//   1. a requirement with no story
//   2. a requirement with neither a screen nor a job
//   3. an artifact citing a requirement that does not exist
//   4. a requirement with no milestone

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLAN = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'plan')
const CHECK_ONLY = process.argv.includes('--check')

const RE = {
  req: /\bREQ-[A-Z]{3}-\d{3}\b/g,
  reqDef: /^####\s+(REQ-[A-Z]{3}-\d{3})\s+—|·\s+(REQ-[A-Z]{3}-\d{3})\s+—/gm,
  ent: /\bENT-[a-z_]+\b/g,
  entDefLine: /^####\s+(`ENT-[a-z_]+`(?:\s+·\s+`ENT-[a-z_]+`)*)/gm,
  pol: /\bPOL-[a-z_]+\.[a-z_]+(?:\.[a-z_]+)?\b/g,
  scr: /\bSCR-\d{3}\b/g,
  job: /\bJOB-[a-z_]+\b/g,
  msg: /\bMSG-[a-z_]+\b/g,
  story: /^####\s+(STORY-[A-Z]{3}-\d{3})\s+—/gm,
  milestone: /\bM[0-8]\b/g,
}

// TRACEABILITY.md is excluded: it is generated FROM this analysis, so feeding
// it back in makes every requirement look covered by its own matrix row.
const files = Object.fromEntries(
  readdirSync(PLAN)
    .filter((f) => f.endsWith('.md') && f !== 'TRACEABILITY.md')
    .map((f) => [f, readFileSync(join(PLAN, f), 'utf8')])
)

const uniq = (xs) => [...new Set(xs)].sort()

// The documents cite ranges — `REQ-EVT-001 … REQ-EVT-015` — because writing
// fifteen IDs out is unreadable. Expand them, or every range reads as two
// endpoints and the thirteen in between look uncovered.
const RANGE = /\b(REQ-([A-Z]{3})-(\d{3}))`?\s*(?:…|\.\.\.|—)\s*`?(REQ-\2-(\d{3}))\b/g
function expandRanges(text) {
  const extra = []
  for (const m of text.matchAll(RANGE)) {
    const [, , area, from, , to] = m
    for (let i = Number(from); i <= Number(to); i++) {
      extra.push(`REQ-${area}-${String(i).padStart(3, '0')}`)
    }
  }
  return extra
}

const all = (text, re) => {
  const found = [...text.matchAll(re)].map((m) => m[0])
  return uniq(re === RE.req ? [...found, ...expandRanges(text)] : found)
}

// ── definitions ───────────────────────────────────────────────────────────
const prd = files['01-prd.md'] ?? ''
const definedReqs = uniq(
  [...prd.matchAll(RE.reqDef)].map((m) => m[1] ?? m[2]).filter(Boolean)
)
const definedEnts = uniq(
  [...(files['02-domain-model.md'] ?? '').matchAll(RE.entDefLine)].flatMap((m) =>
    [...m[1].matchAll(RE.ent)].map((x) => x[0])
  )
)

// ── stories, with their requirements and milestone ────────────────────────
const backlog = files['15-backlog.md'] ?? ''
const stories = []
{
  const parts = backlog.split(/^####\s+/m).slice(1)
  for (const part of parts) {
    const id = part.match(/^(STORY-[A-Z]{3}-\d{3})\s+—/)?.[1]
    if (!id) continue
    const head = part.split('\n').slice(0, 4).join('\n')
    stories.push({
      id,
      reqs: all(head, RE.req),
      milestones: all(head, RE.milestone),
    })
  }
}

// ── per-requirement rollup ────────────────────────────────────────────────
const row = Object.fromEntries(
  definedReqs.map((r) => [
    r,
    { entities: [], policies: [], screens: [], jobs: [], messages: [], stories: [], milestones: [] },
  ])
)

// A requirement is linked to an artifact when they appear in the same section
// of a document. Sections are `###`/`####` blocks; the whole file is the
// fallback for documents without them.
// A requirement links to an artifact when they share a scope. A markdown table
// ROW is its own scope, and prose is scoped to its section — otherwise an index
// table linking 50 screens to 200 requirements links all of them to each other.
const link = (reqs, scope) => {
  const ents = all(scope, RE.ent)
  const pols = all(scope, RE.pol)
  const scrs = all(scope, RE.scr)
  const jobs = all(scope, RE.job)
  const msgs = all(scope, RE.msg)
  for (const r of reqs) {
    if (!row[r]) continue
    row[r].entities.push(...ents)
    row[r].policies.push(...pols)
    row[r].screens.push(...scrs)
    row[r].jobs.push(...jobs)
    row[r].messages.push(...msgs)
  }
}

for (const [name, text] of Object.entries(files)) {
  if (name === '15-backlog.md' || name.startsWith('_')) continue
  for (const section of text.split(/^#{2,4}\s+/m)) {
    const lines = section.split('\n')
    const tableRows = lines.filter((l) => l.trimStart().startsWith('|'))
    const prose = lines.filter((l) => !l.trimStart().startsWith('|')).join('\n')

    for (const rowText of tableRows) {
      const reqs = all(rowText, RE.req).filter((r) => row[r])
      if (reqs.length) link(reqs, rowText)
    }
    const proseReqs = all(prose, RE.req).filter((r) => row[r])
    if (proseReqs.length) link(proseReqs, prose)
  }
}

for (const s of stories) {
  for (const r of s.reqs) {
    if (!row[r]) continue
    row[r].stories.push(s.id)
    row[r].milestones.push(...s.milestones)
  }
}
for (const r of definedReqs) {
  for (const k of Object.keys(row[r])) row[r][k] = uniq(row[r][k])
}

// ── cross-cutting requirements ────────────────────────────────────────────
// Requirements that are properties of the WHOLE system, not of a screen or a
// job. Pinning them to one arbitrary screen would be a worse lie than naming
// them here. Adding to this list is a visible diff and needs a reason — it is
// an exemption from gap report 2, not from coverage: each still needs a story.
const CROSS_CUTTING = {
  'REQ-INT-001': 'RTL is the rendering mode of every screen',
  'REQ-INT-002': 'every string on every screen',
  'REQ-INT-003': 'every date and number everywhere',
  'REQ-INT-004': 'every layout',
  'REQ-INT-005': 'every text node',
  'REQ-INT-008': 'every route',
  'REQ-INT-009': 'every screen\u2019s first paint',
  'REQ-NFR-001': 'a property of every table in the schema',
  'REQ-NFR-002': 'every server action and route handler',
  'REQ-NFR-003': 'a header on every response',
  'REQ-NFR-004': 'a property of every data read in the product',
  'REQ-NFR-005': 'enforced at the edges of many surfaces at once',
  'REQ-NFR-009': 'every screen at 375px',
  'REQ-NFR-010': 'a property of the schema and its query plans',
  'REQ-NFR-011': 'a constraint on decisions, not a feature — nothing is built',
  'REQ-NFR-016': 'the deployment, not a screen',
  'REQ-NFR-017': 'the environments themselves',
  'REQ-NFR-018': 'the test suites',
  'REQ-NFR-020': 'every migration',
}

// ── gap reports ───────────────────────────────────────────────────────────
const gaps = { noStory: [], noScreenOrJob: [], brokenCitations: [], noMilestone: [] }

for (const r of definedReqs) {
  if (!row[r].stories.length) gaps.noStory.push(r)
  if (!row[r].screens.length && !row[r].jobs.length && !CROSS_CUTTING[r]) gaps.noScreenOrJob.push(r)
  if (!row[r].milestones.length) gaps.noMilestone.push(r)
}

const known = new Set(definedReqs)
for (const [name, text] of Object.entries(files)) {
  if (name.startsWith('_')) continue
  for (const cited of all(text, RE.req)) {
    if (!known.has(cited)) gaps.brokenCitations.push(`${name}: ${cited}`)
  }
}
const knownEnt = new Set(definedEnts)
for (const [name, text] of Object.entries(files)) {
  if (name === '02-domain-model.md' || name.startsWith('_')) continue
  for (const cited of all(text, RE.ent)) {
    if (!knownEnt.has(cited)) gaps.brokenCitations.push(`${name}: ${cited}`)
  }
}

// ── render ────────────────────────────────────────────────────────────────
const fmt = (xs, n = 3) =>
  xs.length === 0 ? '—' : xs.slice(0, n).map((x) => `\`${x}\``).join(' ') + (xs.length > n ? ` +${xs.length - n}` : '')

const areas = uniq(definedReqs.map((r) => r.split('-')[1]))
let table = ''
for (const area of areas) {
  table += `\n### ${area}\n\n`
  table += '| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |\n'
  table += '|---|---|---|---|---|---|---|---|\n'
  for (const r of definedReqs.filter((x) => x.split('-')[1] === area)) {
    const c = row[r]
    table += `| \`${r}\` | ${fmt(c.entities)} | ${fmt(c.policies, 2)} | ${fmt(c.screens)} | ${fmt(c.jobs, 2)} | ${fmt(c.messages, 2)} | ${fmt(c.stories, 2)} | ${c.milestones.join(', ') || '—'} |\n`
  }
}

const summary = `
| Artifact | Count |
|---|---|
| Requirements (\`REQ-*\`) | **${definedReqs.length}** |
| Entities (\`ENT-*\`) | **${definedEnts.length}** |
| Stories (\`STORY-*\`) | **${stories.length}** |
| Screens cited (\`SCR-*\`) | ${uniq(Object.values(row).flatMap((c) => c.screens)).length} |
| Jobs cited (\`JOB-*\`) | ${uniq(Object.values(row).flatMap((c) => c.jobs)).length} |
| Messages cited (\`MSG-*\`) | ${uniq(Object.values(row).flatMap((c) => c.messages)).length} |
`

const START = '<!-- TRACEABILITY:START -->'
const END = '<!-- TRACEABILITY:END -->'
const crossCutting =
  '\n## Cross-cutting requirements\n\n' +
  'These have no single screen and no single job **by nature** — they are properties of the whole\n' +
  'system. Each still has a story and a milestone; only gap report 2 exempts them. The list lives in\n' +
  '`scripts/traceability.mjs`, so adding to it is a reviewable diff.\n\n' +
  '| Requirement | Why it has no single screen or job |\n|---|---|\n' +
  Object.entries(CROSS_CUTTING).map(([r, why]) => `| \`${r}\` | ${why} |`).join('\n') +
  '\n'

const body = `${START}\n\n## Summary\n${summary}${crossCutting}\n## Matrix\n${table}\n${END}`

const target = join(PLAN, 'TRACEABILITY.md')
if (!CHECK_ONLY) {
  let doc
  try {
    doc = readFileSync(target, 'utf8')
  } catch {
    doc = `# TRACEABILITY\n\n**Generated — do not edit by hand.** Run \`node scripts/traceability.mjs\`.\n\n${START}\n${END}\n`
  }
  writeFileSync(target, doc.replace(new RegExp(`${START}[\\s\\S]*${END}`), body))
}

// ── report ────────────────────────────────────────────────────────────────
const report = (label, xs) => {
  if (!xs.length) return 0
  console.error(`\n✗ ${label} (${xs.length}):`)
  for (const x of xs.slice(0, 25)) console.error(`    ${x}`)
  if (xs.length > 25) console.error(`    … and ${xs.length - 25} more`)
  return 1
}

let failed = 0
failed += report('requirements with no story', gaps.noStory)
failed += report('requirements with neither a screen nor a job', gaps.noScreenOrJob)
failed += report('citations to artifacts that do not exist', uniq(gaps.brokenCitations))
failed += report('requirements with no milestone', gaps.noMilestone)

if (failed) {
  console.error(`\n${definedReqs.length} requirements · ${stories.length} stories · FAILED\n`)
  process.exit(1)
}
console.log(
  `✓ ${definedReqs.length} requirements · ${definedEnts.length} entities · ${stories.length} stories · no gaps`
)
