#!/usr/bin/env node
// The font-set gate. REQ-DSG-016: "a font present in one and absent in
// another fails CI, not production."
//
//   node scripts/fonts/check.mjs            # files + build (if .next exists)
//   node scripts/fonts/check.mjs --no-build # files only — used in image builds
//
// Three things are asserted:
//   1. Every manifest entry's file exists and hashes to its name. No stray
//      font file sits in the package. This is what the worker and converter
//      images run at build time, so an image cannot ship a font the manifest
//      does not name.
//   2. Every (family, weight, style) in `faces` has exactly one `ttf` entry
//      derived from exactly that group's woff2 hashes — so LibreOffice's set
//      cannot silently lag the web set.
//   3. When a Next build is present, the Arabic and Latin faces it emitted are
//      exactly the manifest's faces, by hash. The app serves next/font's
//      output; if Google's subset changes under us, this is where it shows.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { collectBuildFaces, FONTS, MANIFEST, ROOT } from './extract.mjs'

const filesOnly = process.argv.includes('--no-build')
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const problems = []
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

// 1. files ↔ manifest
const listed = new Set()
for (const entry of [...manifest.faces, ...manifest.ttf]) {
  listed.add(entry.file)
  const p = join(FONTS, entry.file)
  if (!existsSync(p)) {
    problems.push(`missing file ${entry.file} (${entry.family} ${entry.weight})`)
    continue
  }
  const h = sha(p)
  if (h !== entry.sha256) problems.push(`${entry.file}: content hashes to ${h.slice(0, 12)}…, not its name`)
  if (!entry.file.startsWith(entry.sha256)) problems.push(`${entry.file}: filename is not its sha256`)
}
for (const f of readdirSync(FONTS)) {
  if (/\.(woff2|ttf|otf|woff)$/.test(f) && !listed.has(f)) problems.push(`stray font file not in the manifest: ${f}`)
}

// 2. ttf ↔ faces
const groups = new Map()
for (const f of manifest.faces) {
  const k = `${f.family}|${f.weight}|${f.style}`
  groups.set(k, [...(groups.get(k) ?? []), f.sha256].sort())
}
const ttfByKey = new Map()
for (const t of manifest.ttf) {
  const k = `${t.family}|${t.weight}|${t.style}`
  if (ttfByKey.has(k)) problems.push(`two ttf entries for ${k}`)
  ttfByKey.set(k, t)
}
for (const [k, shas] of groups) {
  const t = ttfByKey.get(k)
  if (!t) {
    problems.push(`no ttf derived for ${k} — run \`npm run fonts:derive\``)
    continue
  }
  const from = [...t.derivedFrom].sort()
  if (JSON.stringify(from) !== JSON.stringify(shas)) problems.push(`ttf for ${k} was derived from a different woff2 set — run \`npm run fonts:derive\``)
}
for (const k of ttfByKey.keys()) if (!groups.has(k)) problems.push(`ttf entry ${k} has no web face`)

// 3. build ↔ manifest
let buildFaces = 0
if (!filesOnly) {
  const built = existsSync(join(ROOT, '.next')) ? collectBuildFaces() : []
  if (!built.length) {
    console.log('· no Next build present — skipping the build ↔ manifest assertion (run `npm run build` to include it)')
  } else {
    buildFaces = built.length
    const want = new Map(manifest.faces.map((f) => [f.sha256, f]))
    const have = new Map(built.map((f) => [f.sha256, f]))
    for (const [h, f] of have) if (!want.has(h)) problems.push(`the build emits ${f.family} ${f.weight} [${f.script}] as ${h.slice(0, 12)}…, which the manifest does not list — the app's font set drifted; run \`npm run fonts:extract && npm run fonts:derive\`, then review the parity goldens`)
    for (const [h, f] of want) if (!have.has(h)) problems.push(`manifest lists ${f.family} ${f.weight} [${f.script}] ${h.slice(0, 12)}… but the build no longer emits it`)
  }
}

if (problems.length) {
  console.error(`font set: ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log(
  `font set OK — ${manifest.faces.length} web face(s), ${manifest.ttf.length} TrueType file(s)` +
    (buildFaces ? `, build matches (${buildFaces} faces)` : ''),
)
