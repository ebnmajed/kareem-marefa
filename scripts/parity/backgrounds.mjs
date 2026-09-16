// The background block — DEC-125, DEC-127, DEC-148, REQ-DSG-014, W8.e.
//
// Reported APART from the 28 text assertions, so «28 of 28» keeps meaning
// seven shaping cases over four export paths. The seven cases stay on a white
// solid background on purpose: shaping geometry does not depend on the
// background, and a dark page under them would make every capture «100 %
// inked» by the old rule and retire the guard that caught two blank goldens.
//
// What a poster's background CAN get wrong, each asserted here:
//
//   gradient-rtl  — the gradient a v2 poster declares, bound to the dark
//                   platform palette, reaches Chromium's computed style as
//                   exactly the palette's colours at the declared angle (no
//                   stop fell back to white), and paints from its first stop
//                   to its last in that direction. Tier B against a reviewed
//                   golden, blocking on the golden's own platform (DEC-028).
//   gradient-ltr  — ★ the same document in LTR computes `360 − angle`, and
//                   its capture EQUALS the RTL capture flipped horizontally,
//                   both rendered in this run. No golden is involved, so it
//                   blocks on every platform: this is what turns the mirror
//                   rule in `backgroundCss()` from a comment into a pixel fact.
//   ink-on-dark   — the PRODUCTION blank-capture probe (`inkedRatio`, the
//                   worker's own call with the worker's own reference CSS):
//                   a layer-less dark gradient is BLANK, the same page with
//                   one line of text is not — and the pre-wave-8 rule
//                   (any channel below 240) would have called the blank page
//                   fully inked, which is the failure it exists to show.
//
// Goldens live under `goldens/backgrounds/` with their own record, so
// `signature.json` and the seven text goldens do not move. `--update` (or
// `--update-backgrounds`, which writes this block and nothing else) writes
// them; a person reviews the image and commits it (REQ-DSG-015).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASELINE_LIBRARY, INK_REFERENCE_CSS, backgroundCss, inkedRatio, platformBrand, renderDocumentToHtml } from '@kareem/designer-runtime'

export const BACKGROUND_CASES = ['gradient-rtl', 'gradient-ltr', 'ink-on-dark']

/** The production threshold (`worker/src/render/variant.ts`). */
const MIN_INK_RATIO = 0.001
const W = 540
const H = 675

/** The gradient a v2 poster actually ships, not a copy of it. */
function posterGradient() {
  const template = BASELINE_LIBRARY.find((t) => t.purpose === 'poster' && t.document.background?.type === 'gradient')
  if (!template) throw new Error('backgrounds: no poster in the library declares a gradient — DEC-127 has not landed')
  return { family: template.family, background: template.document.background }
}

function documentFor(direction, background, layers = []) {
  return { schemaVersion: 1, purpose: 'poster', master: { width: W, height: H, unit: 'px' }, direction, background, layers }
}

const rgb = (hex) => {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

async function render(browser, doc, { fonts = [], bindings, reference = false }) {
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
    await page.setContent(renderDocumentToHtml(doc, { fonts, bindings }), { waitUntil: 'load' })
    await page.evaluate(async (families) => {
      await Promise.all(families.map((f) => document.fonts.load(`400 40px "${f}"`)))
      await document.fonts.ready
    }, [...new Set(fonts.map((f) => f.family))])
    const computed = await page.evaluate(() => getComputedStyle(document.querySelector('.dr-root')).backgroundImage)
    // ★ The VIEWPORT, sized to the page — the worker's own call
    // (`captureBeyondViewport: false`). A `clip` or element screenshot of a
    // gradient root came back one flat rgb(18, 18, 18) in headless Chrome,
    // measured, while the viewport capture of the same page is the gradient.
    const capture = await page.screenshot({ type: 'png', encoding: 'base64', captureBeyondViewport: false })
    let ink = null
    let inkAgainstWhite = null
    if (reference) {
      // The worker's sequence, verbatim: capture, hide every layer, capture
      // the background alone, measure the difference.
      inkAgainstWhite = await page.evaluate(inkedRatio, { capture, reference: null })
      await page.addStyleTag({ content: INK_REFERENCE_CSS })
      const ref = await page.screenshot({ type: 'png', encoding: 'base64', captureBeyondViewport: false })
      ink = await page.evaluate(inkedRatio, { capture, reference: ref })
    }
    return { computed, capture, ink, inkAgainstWhite }
  } finally {
    await page.close()
  }
}

/** Four corner pixels, and the capture flipped horizontally — in-browser, so
 *  the harness still needs no image dependency. */
const inspect = (diffPage, b64) =>
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
    const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
    const m = 3
    const corners = { tl: px(m, m), tr: px(img.width - 1 - m, m), bl: px(m, img.height - 1 - m), br: px(img.width - 1 - m, img.height - 1 - m) }
    const flip = document.createElement('canvas')
    flip.width = img.width
    flip.height = img.height
    const fctx = flip.getContext('2d')
    fctx.translate(img.width, 0)
    fctx.scale(-1, 1)
    fctx.drawImage(img, 0, 0)
    return { corners, flipped: flip.toDataURL('image/png').split(',')[1] }
  }, b64)

export async function runBackgroundBlock({ browser, diffPage, diffOf, facesFor, family, goldens, platform, update, report }) {
  const dir = join(goldens, 'backgrounds')
  const recordPath = join(dir, 'record.json')
  const goldenRtl = join(dir, 'gradient-rtl.png')
  const { family: posterFamily, background } = posterGradient()
  const palette = platformBrand('dark')
  const bindings = { values: palette }

  const rtlDoc = documentFor('rtl', background)
  const ltrDoc = documentFor('ltr', background)
  const rtl = await render(browser, rtlDoc, { bindings })
  const ltr = await render(browser, ltrDoc, { bindings })

  if (update) {
    const inkNote = await inspect(diffPage, rtl.capture)
    const [first, last] = [inkNote.corners.tl, inkNote.corners.br]
    if (luminance(first) === luminance(last)) {
      console.error('REFUSING to write the background golden: the gradient painted one flat colour')
      return { failed: 1, asserted: 0, wrote: false }
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(goldenRtl, Buffer.from(rtl.capture, 'base64'))
    writeFileSync(recordPath, JSON.stringify({ platform, family: posterFamily, background, scheme: 'dark', size: [W, H] }, null, 2) + '\n')
    console.log(`background golden written: goldens/backgrounds/gradient-rtl.png (${posterFamily}'s gradient, dark) — REVIEW THE IMAGE`)
    return { failed: 0, asserted: 0, wrote: true }
  }

  let failed = 0
  let asserted = 0
  const fail = (msg) => {
    failed++
    report.problem(`background · ${msg}`)
  }
  const pass = (msg) => report.ok(`background · ${msg}`)

  const stopColours = background.stops.map((s) => {
    const token = s.color.replace(/^\{\{|\}\}$/g, '').trim()
    return palette[token]
  })

  /* ── gradient-rtl ─────────────────────────────────────────────────────── */
  asserted++
  {
    const expectedCss = backgroundCss(rtlDoc, bindings)
    const wantAngle = `linear-gradient(${background.angle}deg`
    const problems = []
    if (stopColours.some((c) => !c)) problems.push(`a stop names a token the dark palette does not have: ${background.stops.map((s) => s.color).join(', ')}`)
    if (!rtl.computed.startsWith(wantAngle)) problems.push(`computed ${rtl.computed}, expected it to start ${wantAngle}`)
    for (const c of stopColours.filter(Boolean)) if (!rtl.computed.includes(rgb(c))) problems.push(`stop ${c} (${rgb(c)}) is not in the computed ${rtl.computed}`)
    if (rtl.computed.includes('rgb(255, 255, 255)') && !stopColours.includes('#ffffff')) problems.push(`a stop fell back to white: ${rtl.computed}`)

    // 0deg points up and angles turn clockwise, so the first stop sits at the
    // corner the line starts from: top-left for 90–180deg, top-right for 180–270deg.
    const { corners } = await inspect(diffPage, rtl.capture)
    const start = background.angle > 180 ? corners.tr : corners.tl
    const end = background.angle > 180 ? corners.bl : corners.br
    const wantDarkerFirst = luminance(rgbTuple(stopColours[0])) < luminance(rgbTuple(stopColours.at(-1)))
    if (wantDarkerFirst !== luminance(start) < luminance(end)) problems.push(`painted in the wrong direction: start ${start}, end ${end}`)

    if (problems.length) fail(`gradient-rtl: ${problems.join(' · ')}`)
    else {
      // Tier B against the reviewed golden.
      if (!existsSync(goldenRtl)) fail('gradient-rtl [Tier B]: no golden — run --update-backgrounds and review the image')
      else {
        const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : {}
        const r = await diffOf(rtl.capture, readFileSync(goldenRtl).toString('base64'))
        const blocking = (record.platform ?? platform) === platform
        if (r.sizeMismatch) fail('gradient-rtl [Tier B]: size differs from the golden')
        else if (r.ratio > 0.001) {
          if (blocking) fail(`gradient-rtl [Tier B]: ${(r.ratio * 100).toFixed(3)}% differs from the golden (limit 0.1%)`)
          else report.advisory(`background · gradient-rtl [Tier B]: ${(r.ratio * 100).toFixed(3)}% vs a golden made on ${record.platform}`)
        } else pass(`gradient-rtl — ${expectedCss}, first stop at the start corner, ${(r.ratio * 100).toFixed(3)}% vs golden`)
      }
    }
  }

  /* ── gradient-ltr: the mirror, as pixels ──────────────────────────────── */
  asserted++
  {
    const mirrored = (360 - background.angle) % 360
    const problems = []
    if (!ltr.computed.startsWith(`linear-gradient(${mirrored}deg`)) problems.push(`computed ${ltr.computed}, expected ${mirrored}deg (360 − ${background.angle})`)
    const { flipped } = await inspect(diffPage, ltr.capture)
    const d = await diffOf(flipped, rtl.capture)
    if (d.sizeMismatch) problems.push('the flipped LTR capture is not the RTL capture\'s size')
    else if (d.ratio > 0.001) problems.push(`the flipped LTR capture differs from the RTL capture by ${(d.ratio * 100).toFixed(3)}% (limit 0.1%)`)
    if (problems.length) fail(`gradient-ltr: ${problems.join(' · ')}`)
    else pass(`gradient-ltr — ${mirrored}deg, and the LTR page is the RTL page mirrored (${(d.ratio * 100).toFixed(3)}%)`)
  }

  /* ── ink-on-dark: the production probe ────────────────────────────────── */
  asserted++
  {
    const blank = await render(browser, rtlDoc, { bindings, reference: true })
    const text = {
      id: 'l_line',
      kind: 'text',
      frame: { x: 60, y: 280, w: 420, h: 120 },
      text: { literal: 'كريم معرفة' },
      font: { family, size: 64, lineHeight: 1.7, weight: 600 },
      align: 'center',
      color: '{{brand.fgHeading}}',
    }
    const inked = await render(browser, documentFor('rtl', background, [text]), { bindings, reference: true, fonts: facesFor(family) })
    const problems = []
    if (blank.ink >= MIN_INK_RATIO) problems.push(`a page with no layers measured ${(blank.ink * 100).toFixed(3)}% inked — the probe would pass a blank export`)
    if (inked.ink < MIN_INK_RATIO) problems.push(`a page with a line of text measured ${(inked.ink * 100).toFixed(3)}% inked — the probe would fail a good export`)
    if (problems.length) fail(`ink-on-dark: ${problems.join(' · ')}`)
    else
      pass(
        `ink-on-dark — blank ${(blank.ink * 100).toFixed(3)}%, with text ${(inked.ink * 100).toFixed(3)}%; ` +
          `the pre-wave-8 rule would have called the blank page ${(blank.inkAgainstWhite * 100).toFixed(1)}% inked`,
      )
  }

  return { failed, asserted, wrote: false }
}

function rgbTuple(hex) {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
