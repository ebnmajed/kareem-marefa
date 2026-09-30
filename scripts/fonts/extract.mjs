#!/usr/bin/env node
// Materialises the app's font binaries out of the next/font build output into
// packages/fonts — the content-addressed manifest (REQ-DSG-016, REQ-INT-009).
//
// This is A39's materialisation flow in miniature, and it is the reason the
// parity goldens mean anything: a golden rendered with an unknown font file
// proves nothing. Fonts are stored by SHA-256 so a drift is a different
// filename, not a silently different render (D66).
//
// The two Plex faces load through next/font/google (10 §4.1), and this script pins the
// bytes that build fetched. The three app-only families are self-hosted since DEC-203 and
// run the other way (see LOCAL_FACES). Either way the guarantee is the same: the worker's
// Chromium and — after `fonts:derive` — the worker's poppler use the SAME bytes the app serves.
//
//   npm run build && npm run fonts:extract
//
// `check.mjs` imports collectBuildFaces() to assert the build still matches
// the manifest, which is the CI gate.

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..', '..')
export const FONTS = join(ROOT, 'packages', 'fonts')
export const MANIFEST = join(FONTS, 'manifest.json')
const MEDIA = join(ROOT, '.next', 'static', 'media')

// Two scripts matter, not one.
//
// ARABIC: a face whose unicode-range covers U+6?? is the one that shapes
// Arabic. LATIN: the parity cases deliberately mix scripts (A30 requires Latin
// companions), and any glyph outside the Arabic subset falls back to whatever
// the machine happens to have installed — which differs between a developer's
// Mac, a container, and a CI runner. That is a real D66 hazard, and it showed
// up as a Tier A drift on exactly the one case with the most Latin in it.
// Pin both, so nothing falls back. The other subsets next/font emits
// (Cyrillic, Greek, Vietnamese, Latin Extended) are not part of the set: the
// product renders Arabic and Latin, and a font set is a promise about what is
// rendered, not about everything Google happens to ship.
const ARABIC_RANGE = /U\+6\?\?/
// Google's basic-Latin subset declares `U+??`, meaning U+0000-U+00FF. That is
// distinct from the Arabic `U+6??` — after `U+` comes a digit there, so the
// literal two-question-mark form matches only the Latin subset.
const LATIN_RANGE = /U\+\?\?/

// ★ THREE FAMILIES ARE SELF-HOSTED (DEC-203). Reem Kufi, Amiri and Baloo Bhaijaan 2 are read by
// `next/font/local` straight from this package's own files, so for them the direction is
// reversed: the manifest is the source and the build is the copy. The build names a local face
// after the constant that declares it in `src/lib/fonts.ts`; this maps those names back. For
// these families `extract` keeps the manifest's entries as they are — there is nothing to
// fetch — and `check` still compares what the build emits with the manifest, by hash.
export const LOCAL_FACES = {
  reemKufi: 'Reem Kufi',
  reemKufiLatin: 'Reem Kufi',
  amiri: 'Amiri',
  amiriLatin: 'Amiri',
  balooArabic: 'Baloo Bhaijaan 2',
  balooLatin: 'Baloo Bhaijaan 2',
}
const LOCAL_FAMILIES = new Set(Object.values(LOCAL_FACES))

/**
 * Every Arabic or Latin @font-face the build emitted, with the hash of its
 * bytes. Returns [] when there is no build. Throws if a face's file is missing.
 */
export function collectBuildFaces() {
  const cssDirs = [join(ROOT, '.next', 'dev', 'static', 'chunks'), join(ROOT, '.next', 'static', 'chunks')]
  const faces = []
  const seen = new Set()
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
        const named = body.match(/font-family:\s*([^;]+);/)?.[1]?.trim().replace(/^["']|["']$/g, '')
        const local = Object.hasOwn(LOCAL_FACES, named ?? '')
        const family = local ? LOCAL_FACES[named] : named
        const weight = Number(body.match(/font-weight:\s*(\d+)/)?.[1] ?? 400)
        const style = body.match(/font-style:\s*([a-z]+)/)?.[1] ?? 'normal'
        const url = body.match(/url\(["']?([^"')]+)["']?\)/)?.[1]
        if (!family || !url) continue
        const script = isArabic ? 'arabic' : 'latin'
        const key = `${family}|${weight}|${style}|${script}`
        if (seen.has(key)) continue
        seen.add(key)
        const src = join(MEDIA, url.split('/').pop())
        const bytes = readFileSync(src)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        faces.push({ family, weight, style, script, sha256, bytes: bytes.length, file: `${sha256}.woff2`, src, local })
      }
    }
  }
  faces.sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight || a.script.localeCompare(b.script))
  return faces
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = collectBuildFaces()
  const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
  // The self-hosted families come from the manifest, never from the build: a variable file is
  // one face in the build and one entry per weight here, and the build cannot say which weights.
  const kept = (previous.faces ?? []).filter((f) => LOCAL_FAMILIES.has(f.family)).map((f) => ({ ...f, local: true }))
  const faces = [...built.filter((f) => !f.local), ...kept].sort(
    (a, b) => a.family.localeCompare(b.family) || a.weight - b.weight || a.script.localeCompare(b.script),
  )
  if (!built.length) {
    console.error('no font faces found — run `npm run build` first')
    process.exit(1)
  }
  for (const f of faces) if (f.src) copyFileSync(f.src, join(FONTS, f.file))
  const manifest = {
    faces: faces.map((f) => {
      const entry = { ...f }
      delete entry.src
      delete entry.local
      return entry
    }),
    // Kept as-is; `fonts:derive` regenerates it, and `fonts:check` fails if
    // it no longer matches the faces above.
    ttf: previous.ttf ?? [],
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`materialised ${faces.length} face(s) → packages/fonts:`)
  for (const m of faces) {
    console.log(`  ${m.family} ${m.weight} ${m.style} [${m.script}]  ${m.sha256.slice(0, 12)}…  ${m.bytes} bytes`)
  }
  if (previous.ttf?.length) console.log('\nnow run `npm run fonts:derive` — the ttf entries were carried over unchanged')
}
