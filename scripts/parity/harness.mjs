#!/usr/bin/env node
// Shaping parity harness — Tiers A and B over FOUR export paths.
// docs/plan/06-visual-designer.md §9, REQ-DSG-014, REQ-DSG-015, DEC-049.
//
//   node scripts/parity/harness.mjs            # check against goldens
//   node scripts/parity/harness.mjs --update   # rewrite goldens (REVIEW THE DIFF)
//   node scripts/parity/harness.mjs --break-font   # prove the harness can fail
//
// SEVEN CASES × FOUR PATHS = 28 assertions (`scripts/parity/paths.mjs` says
// what each path is and how it can go wrong). Path 4 needs the converter and
// SKIPS LOUDLY without it — «21 of 28» — because a skip that reads like a
// pass is how a suite comes to test nothing.
//
// TIER A — text identity. The browser exposes no API for shaped glyph IDs, so
// the signature is the geometry shaping PRODUCES: line-box count, per-line
// widths, total advance, and the per-character rect count. A dropped
// ligature, a substituted face or lost mark positioning all move those
// numbers.
//
//   The probe is `tierASignatureBatch` from @kareem/designer-runtime — THE
//   SAME FUNCTION THE WORKER RUNS ON EVERY PRODUCTION EXPORT. It used to be
//   a copy that lived here, and a copy is exactly the thing this suite
//   exists to prevent: a harness measuring differently from the worker can
//   be green while the worker's own Tier A is wrong.
//
// TIER B — pixel parity, both renders inside this process against the same
// pinned font bytes. Diffing is done in-browser on a canvas, so the harness
// needs no image dependency. It applies to the paths that produce a raster;
// the two PDF paths report Tier A only, and say so, because nothing here
// rasterises a PDF.

import { createHash } from 'node:crypto'
import { platform, arch } from 'node:process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { ARABIC_UNICODE_RANGE, renderDocumentToHtml, tierASignatureBatch } from '@kareem/designer-runtime'
import { CASES } from './cases.mjs'
import { ASSERTIONS, buildDocument, CONTROL_CSS, PATHS } from './paths.mjs'
import { runConverterPath } from './converter.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GOLDENS = join(HERE, 'goldens')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const UPDATE = process.argv.includes('--update')
const BREAK_FONT = process.argv.includes('--break-font')
const PAD = 12

mkdirSync(GOLDENS, { recursive: true })

/* ---------- fonts: inlined by hash, so the render is hermetic ---------- */
// The one font set (REQ-DSG-016). The harness reads the same manifest the
// worker's Chromium and LibreOffice will, so a golden is tied to bytes that
// exist in exactly one place.
const FONTS = join(HERE, '..', '..', 'packages', 'fonts')
const manifest = JSON.parse(readFileSync(join(FONTS, 'manifest.json'), 'utf8')).faces

function facesFor(family) {
  return manifest
    .filter((m) => m.family === family)
    .map((m) => ({
      ...m,
      base64: readFileSync(join(FONTS, m.file)).toString('base64'),
      // The Arabic subset is narrowed to its own range so the Latin face of
      // the same family keeps everything else. Without it the LAST
      // declaration wins for every character and a mixed «جلسة عن Next.js 16»
      // loses its Latin to whatever the host machine has — a different
      // render per machine, which is the thing D66 forbids.
      ...(m.script === 'arabic' ? { unicodeRange: ARABIC_UNICODE_RANGE } : {}),
    }))
}

const fontFingerprint = createHash('sha256')
  .update(
    manifest
      .map((m) => `${m.family}|${m.weight}|${m.style}|${m.script ?? ''}|${m.sha256}`)
      .sort()
      .join(','),
  )
  .digest('hex')
  .slice(0, 16)

/* ---------- the browser ---------- */
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-first-run',
    // Pin the two things that would otherwise vary between machines and make
    // a pixel comparison meaningless.
    '--font-render-hinting=none',
    '--force-color-profile=srgb',
    // Containers run as root, where Chrome's sandbox refuses to start. Opt-in
    // rather than automatic: never drop the sandbox on a developer's machine.
    ...(process.env.CHROME_NO_SANDBOX ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
  ],
})

const diffPage = await browser.newPage()
await diffPage.setContent('<canvas id="x"></canvas>')

/* ---------- in-browser pixel diff, no image dependency ---------- */
const diffOf = (p, q) =>
  diffPage.evaluate(
    async (p, q) => {
      const load = (b64) =>
        new Promise((res, rej) => {
          const img = new Image()
          img.onload = () => res(img)
          img.onerror = () => rej(new Error('undecodable'))
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
        if (Math.abs(d1[i] - d2[i]) > 2 || Math.abs(d1[i + 1] - d2[i + 1]) > 2 || Math.abs(d1[i + 2] - d2[i + 2]) > 2) differing++
      }
      return { sizeMismatch: false, ratio: differing / (d1.length / 4) }
    },
    p,
    q,
  )

const inkOf = (b64) =>
  diffPage.evaluate(async (b64) => {
    const img = await new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('undecodable'))
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
  }, b64)

/** Crop one case's rectangle out of a full-page raster and re-encode it as a
 *  PNG, so a page image out of poppler can be compared case by case rather
 *  than as one undifferentiated sheet. */
const cropOf = (b64, mime, rect, scale) =>
  diffPage.evaluate(
    async (b64, mime, rect, scale) => {
      const img = await new Promise((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = () => rej(new Error('undecodable'))
        i.src = `data:${mime};base64,${b64}`
      })
      const cv = document.createElement('canvas')
      cv.width = Math.max(1, Math.round(rect.w * scale))
      cv.height = Math.max(1, Math.round(rect.h * scale))
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, Math.round(rect.x * scale), Math.round(rect.y * scale), cv.width, cv.height, 0, 0, cv.width, cv.height)
      return cv.toDataURL('image/png').split(',')[1]
    },
    b64,
    mime,
    rect,
    scale,
  )

/* ---------- one DOM path ---------- */
async function renderDomPath(path) {
  const family = BREAK_FONT ? 'NoSuchArabicFace' : path.family
  const doc = buildDocument({ family, pad: PAD })
  const html = renderDocumentToHtml(doc, {
    fonts: BREAK_FONT ? [] : facesFor(path.family),
    extraCss: CONTROL_CSS(PAD),
  })

  const page = await browser.newPage()
  await page.setViewport({ width: doc.master.width, height: Math.max(600, doc.master.height), deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'load' })

  // Print emulation CHANGES LINE BREAKING. Applied before anything is
  // measured, so the PDF paths measure the layout the PDF will actually
  // carry rather than the screen's.
  if (path.print) await page.emulateMediaType('print')

  // `document.fonts.ready` alone is not enough: a face declared but never
  // exercised is not "pending", so ready resolves while the glyphs are still
  // unpainted. Load each weight explicitly, then assert the face is usable.
  const fontsOk = await page.evaluate(async (f) => {
    await Promise.all([400, 500, 600, 700].map((w) => document.fonts.load(`${w} 40px "${f}"`)))
    await document.fonts.ready
    return document.fonts.check(`40px "${f}"`, 'لا')
  }, family)
  if (!fontsOk && !BREAK_FONT) throw new Error(`the ${family} face never became usable — goldens would be blank`)

  const signature = await page.evaluate(
    tierASignatureBatch,
    CASES.map((c) => `case-${c.id}`),
  )

  const shots = {}
  const ink = {}
  const rects = {}
  for (const c of CASES) {
    const layer = doc.layers.find((l) => l.id === `case-${c.id}`)
    rects[c.id] = { x: layer.frame.x, y: layer.frame.y, w: layer.frame.w, h: layer.frame.h }
    // The PDF paths produce no per-case raster here — nothing in this
    // process rasterises a PDF — so Tier B is reported as not applicable
    // rather than faked from the screen capture.
    if (path.print) continue
    const el = await page.$(`[data-layer="case-${c.id}"]`)
    shots[c.id] = await el.screenshot({ encoding: 'base64' })
    ink[c.id] = await inkOf(shots[c.id])
  }

  // Path 4 needs a real PDF of the same document, so it is produced here
  // rather than rendered a third time.
  let pdf = null
  if (path.print) {
    pdf = Buffer.from(
      await page.pdf({
        width: `${doc.master.width}px`,
        height: `${doc.master.height}px`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      }),
    )
  }

  await page.close()
  // Keys are `case-<id>` in the DOM; the golden speaks in bare case ids.
  const byCase = {}
  for (const c of CASES) byCase[c.id] = signature[`case-${c.id}`]
  return { signature: byCase, shots, ink, rects, pdf, documentWidth: doc.master.width }
}

/* ---------- run every path ---------- */
const results = {}
for (const path of PATHS) {
  if (path.tier === 'converter') continue
  results[path.id] = await renderDomPath(path)
}
// Determinism: the screen path rendered twice in the same process must be
// identical. Running it for every path would double the suite's time to
// re-prove one property of one renderer.
const determinism = await renderDomPath(PATHS[0])

/* ---------- path 4: our PDF through poppler ---------- */
const posterPdf = results.poster_pdf
const converter = await runConverterPath(posterPdf?.pdf ?? Buffer.alloc(0), { pageCount: 1 })
let slidePages = null
if (!converter.skipped && converter.pageBytes?.[0]) {
  const pageB64 = converter.pageBytes[0].toString('base64')
  // The PDF page is the document's own size, so the page image's scale is
  // just its width over the document's.
  const scale = await diffPage.evaluate(
    async (b64, documentWidth) => {
      const img = await new Promise((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = () => rej(new Error('undecodable'))
        i.src = `data:image/webp;base64,${b64}`
      })
      return img.width / documentWidth
    },
    pageB64,
    posterPdf.documentWidth,
  )
  slidePages = { crops: {}, ink: {} }
  for (const c of CASES) {
    const crop = await cropOf(pageB64, 'image/webp', posterPdf.rects[c.id], scale)
    slidePages.crops[c.id] = crop
    slidePages.ink[c.id] = await inkOf(crop)
  }
}

/* ---------- goldens ---------- */
const goldenPath = join(GOLDENS, 'signature.json')
const PLATFORM = `${platform}-${arch}`
const record = {
  font: { family: PATHS[0].family, fingerprint: fontFingerprint },
  platform: PLATFORM,
  // Path 1 keeps the top-level `cases` key the spike wrote, so adding three
  // paths does not move the baseline that has been green since M0.
  cases: results.poster_png.signature,
  paths: {
    poster_pdf: results.poster_pdf.signature,
    certificate_pdf: results.certificate_pdf.signature,
  },
}

const imagePath = (pathId, caseId) => (pathId === 'poster_png' ? join(GOLDENS, `${caseId}.png`) : join(GOLDENS, pathId, `${caseId}.png`))

if (UPDATE) {
  const blank = CASES.filter((c) => (results.poster_png.ink[c.id] ?? 0) < 0.001)
  if (blank.length) {
    console.error(`REFUSING to write goldens: blank capture for ${blank.map((c) => c.id).join(', ')}`)
    process.exit(2)
  }
  writeFileSync(goldenPath, JSON.stringify(record, null, 2) + '\n')
  for (const c of CASES) writeFileSync(imagePath('poster_png', c.id), Buffer.from(results.poster_png.shots[c.id], 'base64'))
  if (slidePages) {
    mkdirSync(join(GOLDENS, 'slide_pages'), { recursive: true })
    const blankPages = CASES.filter((c) => (slidePages.ink[c.id] ?? 0) < 0.001)
    if (blankPages.length) {
      console.error(`REFUSING to write slide-page goldens: blank crop for ${blankPages.map((c) => c.id).join(', ')}`)
      process.exit(2)
    }
    for (const c of CASES) writeFileSync(imagePath('slide_pages', c.id), Buffer.from(slidePages.crops[c.id], 'base64'))
  } else {
    console.log('NOTE  the converter path was not run, so its goldens were left as they are.')
  }
  console.log(`goldens written for ${CASES.length} cases over ${Object.keys(record.paths).length + 1} DOM path(s) (font ${fontFingerprint})`)
  console.log('REVIEW THE DIFF — goldens are never refreshed unreviewed (REQ-DSG-015).')
  process.exit(0)
}

if (!existsSync(goldenPath)) {
  console.error('No goldens. Run with --update once, and review what it writes.')
  process.exit(2)
}

const golden = JSON.parse(readFileSync(goldenPath, 'utf8'))

/* ---------- report ---------- */
let fail = 0
let asserted = 0
const problem = (msg) => {
  fail++
  console.log(`FAIL  ${msg}`)
}
const ok = (msg) => console.log(`PASS  ${msg}`)
const advisory = (msg) => console.log(`TIER-C  ${msg}`)

// Tier A is layout geometry — advance widths, line counts, fitted size. It is
// a function of the FONT BYTES and the layout algorithm, not the rasteriser:
// measured byte-identical between macOS Chrome and Linux Chromium on all
// seven cases, and it still moves on every case under a substituted face. So
// it blocks everywhere, which is what gives CI a real D66 check without
// platform goldens.
//
// Tier B is pixels, and pixels are the rasteriser. Measured 0.7-3.9% drift
// macOS vs Linux with identical fonts and identical layout — an order of
// magnitude above the 0.1% threshold. Cross-platform it measures the
// platform, so it is advisory there and blocking on its own (DEC-028).
const samePlatform = (golden.platform ?? PLATFORM) === PLATFORM
if (!samePlatform) {
  console.log(
    `NOTE  goldens were made on ${golden.platform}, running on ${PLATFORM}.\n` +
      `      Tier B (pixels) drops to Tier C — advisory — for this run.\n` +
      `      Tier A stays BLOCKING: it is a property of the font bytes and the\n` +
      `      layout algorithm, not the rasteriser.`,
  )
}
const reportTierB = samePlatform ? problem : advisory

if (golden.font.fingerprint !== fontFingerprint) {
  problem(`font drift: goldens were made with ${golden.font.fingerprint}, this run has ${fontFingerprint}`)
} else {
  ok(`font fingerprint ${fontFingerprint}`)
}

const TIER_A_KEYS = ['lineCount', 'totalAdvance', 'charRectCount', 'zeroWidthRects', 'fontSize']

function checkTierAAgainstGolden(pathId, label, signatures, goldenSignatures) {
  for (const c of CASES) {
    asserted++
    const s = signatures[c.id]
    const g = goldenSignatures?.[c.id]
    if (!s) {
      problem(`${label} · ${c.id}: the layer was not measured at all`)
      continue
    }
    if (!s.distinctFromFallback) {
      problem(`${label} · ${c.id}: the target face never loaded — every measurement below is a fallback`)
      continue
    }
    if (s.letterSpacing !== 'normal' && s.letterSpacing !== '0px') {
      problem(`${label} · ${c.id}: letter-spacing is ${s.letterSpacing}, must be 0 on Arabic (A30)`)
      continue
    }
    if (!g) {
      problem(`${label} · ${c.id}: no golden — run --update once and review what it writes`)
      continue
    }
    const drift = TIER_A_KEYS.filter((k) => JSON.stringify(g[k]) !== JSON.stringify(s[k]))
    if (JSON.stringify(g.lineWidths) !== JSON.stringify(s.lineWidths)) drift.push('lineWidths')
    if (drift.length) {
      problem(`${label} · ${c.id} [Tier A]: ${drift.join(', ')} — expected ${JSON.stringify(TIER_A_KEYS.map((k) => g[k]))}, got ${JSON.stringify(TIER_A_KEYS.map((k) => s[k]))}`)
    } else {
      ok(`${label} · ${c.id} [Tier A] ${s.lineCount} line(s), advance ${s.totalAdvance} — ${c.catches}`)
    }
  }
}

// Path 1 — the screen path, Tiers A and B.
checkTierAAgainstGolden('poster_png', 'poster PNG', results.poster_png.signature, golden.cases)
for (const c of CASES) {
  const shot = results.poster_png.shots[c.id]
  // A blank capture passes every comparison forever. It is the failure mode
  // that produced this check: element screenshots came back empty while the
  // page rendered perfectly, and the goldens recorded the emptiness.
  if ((results.poster_png.ink[c.id] ?? 0) < 0.001) {
    problem(`poster PNG · ${c.id}: capture is blank (${((results.poster_png.ink[c.id] ?? 0) * 100).toFixed(3)}% inked)`)
    continue
  }
  // Determinism: the same document rendered twice in one process must be
  // identical before a golden comparison means anything.
  const d = await diffOf(shot, determinism.shots[c.id])
  if (d.sizeMismatch) {
    problem(`poster PNG · ${c.id} [Tier B/determinism]: render size differs between runs`)
    continue
  }
  if (d.ratio > 0.001) {
    problem(`poster PNG · ${c.id} [Tier B/determinism]: ${(d.ratio * 100).toFixed(3)}% drift between two renders`)
    continue
  }
  const gp = imagePath('poster_png', c.id)
  if (!existsSync(gp)) {
    problem(`poster PNG · ${c.id} [Tier B/regression]: no golden image`)
    continue
  }
  // Regression: this render against the committed golden. Without it Tier B
  // only proves the renderer is consistent with ITSELF — which a broken font
  // satisfies perfectly.
  const r = await diffOf(shot, readFileSync(gp).toString('base64'))
  if (r.sizeMismatch) problem(`poster PNG · ${c.id} [Tier B/regression]: size differs from the golden`)
  else if (r.ratio > 0.001) reportTierB(`poster PNG · ${c.id} [Tier B/regression]: ${(r.ratio * 100).toFixed(3)}% differs from the golden (limit 0.1%)`)
  else ok(`poster PNG · ${c.id} [Tier B] determinism ${(d.ratio * 100).toFixed(3)}%, vs golden ${(r.ratio * 100).toFixed(3)}%`)
}

// Paths 2 and 3 — print-emulated DOM, Tier A only and it says so.
checkTierAAgainstGolden('poster_pdf', 'poster PDF', results.poster_pdf.signature, golden.paths?.poster_pdf)
checkTierAAgainstGolden('certificate_pdf', 'certificate PDF', results.certificate_pdf.signature, golden.paths?.certificate_pdf)
console.log('NOTE  the two PDF paths are Tier A only — nothing in this process rasterises a PDF, so a pixel claim there would be a claim nobody measures.')

// Path 4 — our PDF through poppler.
if (converter.skipped) {
  console.log(
    `\nSKIPPED  slide page images — ${converter.reason}.\n` +
      `         ${asserted} of ${ASSERTIONS} assertions ran. Set CONVERTER_URL (and\n` +
      `         CONVERTER_ALLOW_HTTP=1 on the converter) to run all ${ASSERTIONS}.`,
  )
} else {
  const substituted = converter.substituted ?? []
  if (substituted.length) {
    // Our Chromium PDF embeds its faces as subsets. A substitution means the
    // export claims a font it did not carry — REQ-CRT-005's «renders on a
    // machine with no fonts installed» failing, invisibly, because the PDF
    // still opens and still looks like Arabic.
    problem(`slide page images: the PDF substituted ${substituted.join(', ')} — the faces are not embedded`)
  } else {
    ok('slide page images: every face is embedded in the PDF, none substituted')
  }
  for (const c of CASES) {
    asserted++
    const crop = slidePages?.crops[c.id]
    if (!crop) {
      problem(`slide page images · ${c.id}: no page crop`)
      continue
    }
    if ((slidePages.ink[c.id] ?? 0) < 0.001) {
      problem(`slide page images · ${c.id}: the page crop is blank (${((slidePages.ink[c.id] ?? 0) * 100).toFixed(3)}% inked)`)
      continue
    }
    const gp = imagePath('slide_pages', c.id)
    if (!existsSync(gp)) {
      problem(`slide page images · ${c.id}: no golden — run --update with the converter configured`)
      continue
    }
    const r = await diffOf(crop, readFileSync(gp).toString('base64'))
    if (r.sizeMismatch) problem(`slide page images · ${c.id}: crop size differs from the golden`)
    else if (r.ratio > 0.001) reportTierB(`slide page images · ${c.id}: ${(r.ratio * 100).toFixed(3)}% differs from the golden (limit 0.1%)`)
    else ok(`slide page images · ${c.id} ${(r.ratio * 100).toFixed(3)}% vs golden`)
  }
}

await browser.close()

console.log(`\n${fail ? `${fail} FAILED` : 'parity holds'} — ${asserted} of ${ASSERTIONS} assertions, ${CASES.length} cases × ${PATHS.length} paths`)
process.exit(fail ? 1 : 0)
