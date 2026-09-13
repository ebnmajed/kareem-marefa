#!/usr/bin/env node
// Materialises the Arabic-subset font binaries out of the next/font build
// output into a content-addressed manifest.
//
// This is A39's materialisation flow in miniature, and it is the reason the
// parity goldens mean anything: a golden rendered with an unknown font file
// proves nothing. Fonts are stored by SHA-256 so a drift is a different
// filename, not a silently different render (D66, REQ-DSG-016).
//
//   node scripts/parity/extract-fonts.mjs

import { createHash } from 'node:crypto'
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const MEDIA = join(ROOT, '.next', 'static', 'media')

// Two faces matter, not one.
//
// ARABIC: a face whose unicode-range covers U+6?? is the one that shapes
// Arabic. LATIN: the cases deliberately mix scripts (A30 requires Latin
// companions), and any glyph outside the Arabic subset falls back to whatever
// the machine happens to have installed — which differs between a developer's
// Mac, a container, and a CI runner. That is a real D66 hazard, and it showed
// up as a Tier A drift on exactly the one case with the most Latin in it.
// Pin both, so nothing falls back.
const ARABIC_RANGE = /U\+6\?\?/
// Google's basic-Latin subset declares `U+??`, meaning U+0000-U+00FF. That is
// distinct from the Arabic `U+6??` — after `U+` comes a digit there, so the
// literal two-question-mark form matches only the Latin subset.
const LATIN_RANGE = /U\+\?\?/

const cssDirs = [join(ROOT, '.next', 'dev', 'static', 'chunks'), join(ROOT, '.next', 'static', 'chunks')]
const faces = []

for (const dir of cssDirs) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    continue
  }
  for (const file of entries.filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(join(dir, file), 'utf8')
    for (const block of css.split('@font-face').slice(1)) {
      const body = block.slice(0, block.indexOf('}'))
      const isArabic = ARABIC_RANGE.test(body)
      const isLatin = LATIN_RANGE.test(body)
      if (!isArabic && !isLatin) continue
      const family = body.match(/font-family:\s*([^;]+);/)?.[1]?.trim().replace(/^["']|["']$/g, '')
      const weight = body.match(/font-weight:\s*(\d+)/)?.[1]
      const style = body.match(/font-style:\s*([a-z]+)/)?.[1] ?? 'normal'
      const url = body.match(/url\(["']?([^"')]+)["']?\)/)?.[1]
      if (!family || !url) continue
      faces.push({ family, weight: Number(weight ?? 400), style, script: isArabic ? 'arabic' : 'latin', file: url.split('/').pop() })
    }
  }
}

const manifest = []
const seen = new Set()
for (const face of faces) {
  const key = `${face.family}|${face.weight}|${face.style}|${face.script}`
  if (seen.has(key)) continue
  const src = join(MEDIA, face.file)
  let bytes
  try {
    bytes = readFileSync(src)
  } catch {
    console.warn(`  ! missing ${face.file} — run \`npm run build\` first`)
    continue
  }
  seen.add(key)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  copyFileSync(src, join(HERE, 'fonts', `${sha256}.woff2`))
  manifest.push({ family: face.family, weight: face.weight, style: face.style, script: face.script, sha256, bytes: bytes.length })
}

manifest.sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight)
writeFileSync(join(HERE, 'fonts', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

console.log(`materialised ${manifest.length} face(s):`)
for (const m of manifest) {
  console.log(`  ${m.family} ${m.weight} ${m.style} [${m.script}]  ${m.sha256.slice(0, 12)}…  ${m.bytes} bytes`)
}
if (!manifest.length) process.exit(1)
