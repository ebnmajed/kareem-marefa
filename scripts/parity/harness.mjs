#!/usr/bin/env node
// Shaping parity harness — Tiers A and B (docs/plan/06-visual-designer.md §9).
//
//   node scripts/parity/harness.mjs            # check against goldens
//   node scripts/parity/harness.mjs --update   # rewrite goldens (REVIEW THE DIFF)
//   node scripts/parity/harness.mjs --break-font   # prove the harness can fail
//
// TIER A — text identity. The browser exposes no API for shaped glyph IDs, so
// the signature is the geometry shaping PRODUCES: line-box count, per-line
// rounded widths, total advance, and the per-character rect count. A dropped
// ligature, a substituted face or lost mark positioning all move those numbers.
// It is not a glyph dump, and it does not need to be: it needs to change when
// the shaping changes, and hold when it does not.
//
// TIER B — pixel parity, both renders inside this process against the same
// pinned font bytes. Diffing is done in-browser on a canvas, so the harness
// needs no image dependency.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { CASES, DEFAULT_FONT_SIZE, FAMILY } from './cases.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GOLDENS = join(HERE, 'goldens')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const UPDATE = process.argv.includes('--update')
const BREAK_FONT = process.argv.includes('--break-font')

mkdirSync(GOLDENS, { recursive: true })

/* ---------- fonts: inlined by hash, so the render is hermetic ---------- */
const manifest = JSON.parse(readFileSync(join(HERE, 'fonts', 'manifest.json'), 'utf8'))
const faces = manifest
  .filter((m) => m.family === FAMILY)
  .map((m) => {
    const b64 = readFileSync(join(HERE, 'fonts', `${m.sha256}.woff2`)).toString('base64')
    return `@font-face{font-family:'${FAMILY}';font-style:${m.style};font-weight:${m.weight};` +
      `font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`
  })
  .join('\n')

const fontFingerprint = createHash('sha256')
  .update(manifest.filter((m) => m.family === FAMILY).map((m) => m.sha256).join(','))
  .digest('hex')
  .slice(0, 16)

/* ---------- the fixture ---------- */
// --break-font is the harness testing itself: it points the family at a face
// that does not exist, so the browser falls back. A suite that cannot be made
// to fail is not evidence of anything.
const familyInUse = BREAK_FONT ? 'NoSuchArabicFace' : FAMILY

const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<style>
${BREAK_FONT ? '' : faces}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#fff}
.case{
  font-family:'${familyInUse}', sans-serif;
  font-weight:400;
  letter-spacing:0;            /* A30: never letter-space Arabic */
  line-height:1.7;             /* A30: Arabic needs the leading */
  color:#0B1220;
  padding:12px;
  /* deliberately NOT overflow:hidden — that clips stacked tashkeel (A30) */
}
/* The control strip: the same text in a face that certainly does not exist.
   If a case's advance equals its control's, the target font never loaded.

   position:FIXED, not absolute, and parked off-screen. As absolute elements in
   normal flow they were nowrap and wider than the viewport, which in an RTL
   document overflows LEFTWARD (one measured at x = -74) and grows
   documentElement.scrollWidth past the viewport. That shifts the page's scroll
   origin, and every element-relative screenshot then captures the wrong region
   — silently, producing blank goldens that pass every comparison forever.
   Fixed elements do not contribute to scroll size at all. */
.control{font-family:'NoSuchArabicFace', monospace; position:fixed; top:-10000px;
  left:0; visibility:hidden; white-space:nowrap; pointer-events:none}
</style></head><body>
${CASES.map(
  (c) => `<div class="case" id="case-${c.id}" style="width:${c.width}px;font-size:${c.fontSize ?? DEFAULT_FONT_SIZE}px">${escapeHtml(c.text)}</div>
<div class="control" id="ctrl-${c.id}" style="font-size:${c.fontSize ?? DEFAULT_FONT_SIZE}px">${escapeHtml(c.text)}</div>`,
).join('\n')}
</body></html>`

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m])
}

if (process.argv.includes('--dump-html')) {
  const { writeFileSync: w } = await import('node:fs')
  w(join(HERE, '_dump.html'), html)
  console.log('wrote scripts/parity/_dump.html')
  process.exit(0)
}

/* ---------- extract the Tier A signature ---------- */
const EXTRACT = (caseIds) => {
  const round = (n) => Math.round(n * 100) / 100
  const out = {}
  for (const id of caseIds) {
    const el = document.getElementById(`case-${id}`)
    const ctrl = document.getElementById(`ctrl-${id}`)
    const node = el.firstChild

    // Per-character rects. A ligature makes two code points share one box, so
    // the count drops when a ligature forms and rises when one is dropped.
    const perChar = []
    for (let i = 0; i < node.length; i++) {
      const r = document.createRange()
      r.setStart(node, i)
      r.setEnd(node, i + 1)
      const rect = r.getBoundingClientRect()
      perChar.push({ w: round(rect.width), h: round(rect.height) })
    }

    // Line boxes, from the full range's client rects grouped by top.
    const full = document.createRange()
    full.selectNodeContents(el)
    const rects = [...full.getClientRects()].filter((r) => r.width > 0)
    const byTop = new Map()
    for (const r of rects) {
      const key = round(r.top)
      const cur = byTop.get(key) ?? { top: key, width: 0, height: round(r.height) }
      cur.width = round(cur.width + r.width)
      byTop.set(key, cur)
    }
    const lines = [...byTop.values()].sort((a, b) => a.top - b.top)

    const totalAdvance = round(lines.reduce((s, l) => s + l.width, 0))
    const fallbackWidth = round(ctrl.getBoundingClientRect().width)

    out[id] = {
      lineCount: lines.length,
      lineWidths: lines.map((l) => l.width),
      lineHeights: lines.map((l) => l.height),
      totalAdvance,
      charRectCount: perChar.length,
      zeroWidthRects: perChar.filter((c) => c.w === 0).length,
      fontSize: getComputedStyle(el).fontSize,
      letterSpacing: getComputedStyle(el).letterSpacing,
      // The fallback detector, and the most valuable single number here.
      // Compare the case's TEXT ADVANCE against the same string rendered in a
      // face that definitely does not exist. Equal means the target face never
      // loaded and every other measurement is of a fallback.
      // (An earlier version compared el.scrollWidth — the BOX width, which is
      // just the 600px column — so it never fired. Measure the text.)
      distinctFromFallback: lines.length > 1 || Math.abs(totalAdvance - fallbackWidth) > 1,
    }
  }
  return out
}

/* ---------- run ---------- */
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-first-run', '--font-render-hinting=none', '--force-color-profile=srgb'],
})

async function render() {
  // eslint-disable-next-line no-undef
  const page = await browser.newPage()
  await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'load' })
  // document.fonts.ready alone is not enough: a face declared but never
  // exercised is not "pending", so ready resolves while the glyphs are still
  // unpainted. Load each weight explicitly, then assert the face is usable.
  const fontsOk = await page.evaluate(async (family) => {
    await Promise.all([400, 500, 600].map((w) => document.fonts.load(`${w} 40px "${family}"`)))
    await document.fonts.ready
    return document.fonts.check(`40px "${family}"`, 'لا')
  }, familyInUse)
  if (!fontsOk && !BREAK_FONT) {
    throw new Error(`the ${familyInUse} face never became usable — goldens would be blank`)
  }
  const signature = await page.evaluate(EXTRACT, CASES.map((c) => c.id))
  const shots = {}
  const ink = {}
  for (const c of CASES) {
    const el = await page.$(`#case-${c.id}`)
    shots[c.id] = await el.screenshot({ encoding: 'base64' })
    // How much of the capture is not background. A blank golden passes every
    // comparison forever and proves nothing — which is exactly what happened
    // when font-display:block hid the glyphs while the metrics still resolved.
    ink[c.id] = await page.evaluate(async (b64) => {
      const img = await new Promise((res) => {
        const i = new Image()
        i.onload = () => res(i)
        i.src = `data:image/png;base64,${b64}`
      })
      const cv = document.createElement('canvas')
      cv.width = img.width
      cv.height = img.height
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data
      let inked = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) inked++
      return inked / (d.length / 4)
    }, shots[c.id])
  }
  await page.close()
  return { signature, shots, ink }
}

const a = await render()
const b = await render() // determinism: same bytes, same process, twice

/* ---------- Tier B: in-browser pixel diff, no image dependency ---------- */
const diffPage = await browser.newPage()
await diffPage.setContent('<canvas id="x"></canvas><canvas id="y"></canvas>')

const diffOf = (p, q) =>
  diffPage.evaluate(
    async (p, q) => {
      const load = (b64) =>
        new Promise((res) => {
          const img = new Image()
          img.onload = () => res(img)
          img.src = `data:image/png;base64,${b64}`
        })
      const [i1, i2] = await Promise.all([load(p), load(q)])
      if (i1.width !== i2.width || i1.height !== i2.height) return { sizeMismatch: true, ratio: 1 }
      const cv = document.createElement('canvas')
      cv.width = i1.width
      cv.height = i1.height
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(i1, 0, 0)
      const d1 = ctx.getImageData(0, 0, cv.width, cv.height).data
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.drawImage(i2, 0, 0)
      const d2 = ctx.getImageData(0, 0, cv.width, cv.height).data
      let differing = 0
      for (let i = 0; i < d1.length; i += 4) {
        if (
          Math.abs(d1[i] - d2[i]) > 2 ||
          Math.abs(d1[i + 1] - d2[i + 1]) > 2 ||
          Math.abs(d1[i + 2] - d2[i + 2]) > 2
        )
          differing++
      }
      return { sizeMismatch: false, ratio: differing / (d1.length / 4) }
    },
    p,
    q,
  )

const pixelDiffs = {}
const regressions = {}
for (const c of CASES) {
  // Determinism: the same document rendered twice must be identical.
  pixelDiffs[c.id] = await diffOf(a.shots[c.id], b.shots[c.id])
  // Regression: this render against the committed golden. Without this, Tier B
  // only proves the renderer is consistent with ITSELF — which a broken font
  // satisfies perfectly.
  const gp = join(GOLDENS, `${c.id}.png`)
  regressions[c.id] = existsSync(gp)
    ? await diffOf(a.shots[c.id], readFileSync(gp).toString('base64'))
    : null
}
await browser.close()

/* ---------- report ---------- */
const goldenPath = join(GOLDENS, 'signature.json')
const record = { font: { family: FAMILY, fingerprint: fontFingerprint }, cases: a.signature }

if (UPDATE) {
  const blank = CASES.filter((c) => (a.ink[c.id] ?? 0) < 0.001)
  if (blank.length) {
    console.error(`REFUSING to write goldens: blank capture for ${blank.map((c) => c.id).join(', ')}`)
    process.exit(2)
  }
  writeFileSync(goldenPath, JSON.stringify(record, null, 2) + '\n')
  for (const c of CASES) writeFileSync(join(GOLDENS, `${c.id}.png`), Buffer.from(a.shots[c.id], 'base64'))
  console.log(`goldens written for ${CASES.length} cases (font ${fontFingerprint})`)
  console.log('REVIEW THE DIFF — goldens are never refreshed unreviewed (REQ-DSG-015).')
  process.exit(0)
}

if (!existsSync(goldenPath)) {
  console.error('No goldens. Run with --update once, and review what it writes.')
  process.exit(2)
}

const golden = JSON.parse(readFileSync(goldenPath, 'utf8'))
let fail = 0
const problem = (msg) => {
  fail++
  console.log(`FAIL  ${msg}`)
}
const ok = (msg) => console.log(`PASS  ${msg}`)

if (golden.font.fingerprint !== fontFingerprint) {
  problem(`font drift: goldens were made with ${golden.font.fingerprint}, this run has ${fontFingerprint}`)
} else {
  ok(`font fingerprint ${fontFingerprint}`)
}

for (const c of CASES) {
  const g = golden.cases[c.id]
  const s = a.signature[c.id]

  // A blank capture passes every comparison forever. It is the failure mode
  // that produced this check: element screenshots came back empty while the
  // page rendered perfectly, and the goldens recorded the emptiness.
  if ((a.ink[c.id] ?? 0) < 0.001) {
    problem(`${c.id}: capture is blank (${((a.ink[c.id] ?? 0) * 100).toFixed(3)}% inked) — golden would prove nothing`)
    continue
  }
  if (!s.distinctFromFallback) {
    problem(`${c.id}: the target face never loaded — every measurement below is a fallback`)
    continue
  }
  if (s.letterSpacing !== 'normal' && s.letterSpacing !== '0px') {
    problem(`${c.id}: letter-spacing is ${s.letterSpacing}, must be 0 on Arabic (A30)`)
  }

  // Tier A
  const keys = ['lineCount', 'totalAdvance', 'charRectCount', 'zeroWidthRects', 'fontSize']
  const drift = keys.filter((k) => JSON.stringify(g?.[k]) !== JSON.stringify(s[k]))
  const widthDrift = JSON.stringify(g?.lineWidths) !== JSON.stringify(s.lineWidths)
  if (drift.length || widthDrift) {
    problem(
      `${c.id} [Tier A]: ${[...drift, ...(widthDrift ? ['lineWidths'] : [])].join(', ')} — ` +
        `expected ${JSON.stringify(keys.map((k) => g?.[k]))}, got ${JSON.stringify(keys.map((k) => s[k]))}`,
    )
  } else {
    ok(`${c.id} [Tier A] ${s.lineCount} line(s), advance ${s.totalAdvance}, ${s.zeroWidthRects} zero-width rect(s) — ${c.catches}`)
  }

  // Tier B
  const d = pixelDiffs[c.id]
  const r = regressions[c.id]
  if (d.sizeMismatch) problem(`${c.id} [Tier B/determinism]: render size differs between runs`)
  else if (d.ratio > 0.001)
    problem(`${c.id} [Tier B/determinism]: ${(d.ratio * 100).toFixed(3)}% drift between two renders`)
  else if (!r) problem(`${c.id} [Tier B/regression]: no golden image`)
  else if (r.sizeMismatch) problem(`${c.id} [Tier B/regression]: size differs from the golden`)
  else if (r.ratio > 0.001)
    problem(`${c.id} [Tier B/regression]: ${(r.ratio * 100).toFixed(3)}% differs from the golden (limit 0.1%)`)
  else ok(`${c.id} [Tier B] determinism ${(d.ratio * 100).toFixed(3)}%, vs golden ${(r.ratio * 100).toFixed(3)}%`)
}

console.log(`\n${fail ? `${fail} FAILED` : 'parity holds'} — ${CASES.length} cases, Tiers A and B`)
process.exit(fail ? 1 : 0)
