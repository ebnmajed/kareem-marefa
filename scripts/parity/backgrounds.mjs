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
import { BASELINE_LIBRARY, INK_REFERENCE_CSS, backgroundCss, inkedRatio, platformBrand, resolveColour, renderDocumentToHtml } from '@kareem/designer-runtime'

export const BACKGROUND_CASES = ['solid-rtl', 'gradient-rtl', 'gradient-ltr', 'ink-on-dark']

/** The production threshold (`worker/src/render/variant.ts`). */
const MIN_INK_RATIO = 0.001
const W = 540
const H = 675

/**
 * ★★ THE MIRROR'S SUBJECT IS NOW THE HARNESS'S OWN (wave 24, DEC-242 §1).
 *
 * Until this wave this function read the gradient out of `BASELINE_LIBRARY` and
 * THREW if no poster declared one. `DEC-242` supersedes `REQ-DSG-026`'s gradient
 * clause — the library's posters carry a flat ground — so reading it from there
 * would now fail the whole block on a design change that is correct.
 *
 * The gradient is kept as a FIXTURE because what the two gradient cases prove is
 * not «the library has a gradient»: it is that `backgroundCss()` resolves every
 * stop independently and mirrors the angle as `360 − angle` for LTR, which is a
 * property of the RENDERER and is still reachable through `model.ts`'s union, an
 * org's own document and any future template. Keeping the fixture identical to
 * the gradient `DEC-127` defined is also what keeps `goldens/backgrounds/
 * gradient-rtl.png` from moving for a second reason in one wave.
 *
 * ★ `solid-rtl` is the case that watches the real thing: it takes the ground a
 * REBUILT poster actually ships and needs no golden, because a flat fill is
 * proved by its computed value and its corners rather than by an image.
 */
const MIRROR_GRADIENT = { type: 'gradient', angle: 140, stops: [{ color: '{{brand.surface}}' }, { color: '{{brand.canvasRaise}}' }] }

function mirrorGradient() {
  return { family: 'fixture', background: MIRROR_GRADIENT }
}

/**
 * EVERY flat ground the rebuilt posters ship, with the family each belongs to.
 *
 * ★ All five, not the first one. `REQ-DSG-033` gives each family its own
 * colourway, so there are five tokens that could fail to resolve, and checking
 * one leaves four unwatched — including `{{brand.node}}` as a GROUND, which is
 * the unusual one and the only place lime reaches a document.
 */
function posterGrounds() {
  const found = BASELINE_LIBRARY.filter((t) => t.purpose === 'poster' && t.document.background?.type === 'solid')
  if (!found.length) throw new Error('backgrounds: no poster in the library declares a flat ground — DEC-242 §1 has not landed')
  return found.map((t) => ({ family: t.family, background: t.document.background }))
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
    // ★★ BOTH PROPERTIES, because the shorthand splits by the kind of value.
    // `renderDocumentToHtml` writes `background:<css>` on `.dr-root`, so a
    // GRADIENT lands in `background-image` (and leaves `background-color`
    // transparent) while a SOLID lands in `background-color` (and leaves
    // `background-image: none`). Measured in headless Chrome, all three cases:
    //   solid    #0b0c12            → image `none`              · color rgb(11, 12, 18)
    //   gradient linear-gradient(…) → image linear-gradient(…)  · color rgba(0, 0, 0, 0)
    //   unbound  #ffffff            → image `none`              · color rgb(255, 255, 255)
    // ★ The third row is why this matters rather than being a tidy-up: an
    // unresolved token falls back to WHITE, and `solid-rtl` exists to catch
    // exactly that — while reading `backgroundImage` alone it could never have,
    // because white never appears in the property it was asking about.
    // `computed` keeps its name and its value, so the two gradient cases are
    // unchanged.
    const { computed, computedColor } = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.dr-root'))
      return { computed: s.backgroundImage, computedColor: s.backgroundColor }
    })
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
    return { computed, computedColor, capture, ink, inkAgainstWhite }
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
  const { family: posterFamily, background } = mirrorGradient()
  const grounds = posterGrounds()
  // `ink-on-dark` probes one page, and the default family's ground is the one a
  // session actually gets (`poster_render_context()` resolves `talk` alone).
  const { background: ground } = grounds[0]
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

  /* ── solid-rtl: the ground a REBUILT poster actually ships ─────────────── */
  // ★ wave 24. No golden and no image: a flat fill is completely described by
  // its computed value, and asserting the four corners are one colour catches
  // the only way it can go wrong — a token that did not resolve and fell back to
  // white, which is the trap `render.ts` held open for a gradient (above) and
  // holds open for a solid in exactly the same way.
  asserted++
  {
    const problems = []
    const seen = []
    for (const { family: groundFamily, background: g } of grounds) {
      const solid = await render(browser, documentFor('rtl', g), { bindings })
      // ★ wave 24's re-colour: RESOLVED THROUGH THE RUNTIME, not looked up in the
      // palette. A poster's ground is a `design.*` constant now, and a design
      // constant is in no render context BY CONSTRUCTION — that is what stops an
      // org repainting a platform colourway. `resolveColour()` is the one funnel
      // the renderer itself uses, so asking it is both correct here and the same
      // question Chromium is about to answer.
      const want = resolveColour(bindings, g.color, '')
      if (!/^#[0-9a-fA-F]{6}$/.test(want)) {
        problems.push(`${groundFamily}: the ground does not resolve to a colour: ${g.color} → ${want || 'nothing'}`)
        continue
      }
      // `backgroundColor`, not `backgroundImage` — see `render()`. A flat fill
      // leaves `background-image: none`, so the old read asked a question whose
      // answer could never be a colour.
      if (solid.computedColor !== rgb(want)) problems.push(`${groundFamily}: computed ${solid.computedColor}, expected ${rgb(want)} for ${g.color}`)
      if (want !== '#ffffff' && solid.computedColor === 'rgb(255, 255, 255)') problems.push(`${groundFamily}: the ground fell back to white`)
      // And nothing painted an image over it: a solid document declares none.
      if (solid.computed !== 'none') problems.push(`${groundFamily}: a solid ground also computed a background-image: ${solid.computed}`)
      const { corners } = await inspect(diffPage, solid.capture)
      const flat = [corners.tl, corners.tr, corners.bl, corners.br]
      if (new Set(flat.map((c) => c.join(','))).size !== 1) problems.push(`${groundFamily}: a flat ground painted four different corners`)
      seen.push(`${groundFamily} ${g.color} → ${solid.computedColor}`)
    }
    // Five families, five DISTINCT grounds — REQ-DSG-033's «each family differs
    // by its colourway». Two families sharing one is a colourway that was lost.
    //
    // ★ wave 24's re-colour: compared as RESOLVED COLOURS, not as binding
    // strings. Five distinct strings were `canvas` #0B0C12, `surface` #151724
    // and `canvasRaise` #1E2130 plus two more, and the first three are within
    // 1.10:1, 1.22:1 and 1.11:1 of one another — three of the five families
    // were the same poster on the wall, and a count of strings said nothing.
    const distinct = new Set(grounds.map((x) => resolveColour(bindings, x.background.color, ''))).size
    if (distinct !== grounds.length) problems.push(`${grounds.length} poster families resolve to only ${distinct} distinct grounds`)
    if (problems.length) fail(`solid-rtl: ${problems.join(' · ')}`)
    else pass(`solid-rtl — ${grounds.length} flat grounds, each a resolved token with no image and four equal corners: ${seen.join('; ')}`)
  }

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
    // ★ wave 24: probed on the FLAT ground a poster now ships, which is what
    // production renders. The claim is unchanged — a dark page with no layers
    // must measure blank — and a flat canvas is the harder case of the two.
    const solidDoc = documentFor('rtl', ground)
    const blank = await render(browser, solidDoc, { bindings, reference: true })
    const text = {
      id: 'l_line',
      kind: 'text',
      frame: { x: 60, y: 280, w: 420, h: 120 },
      text: { literal: 'كريم معرفة' },
      font: { family, size: 64, lineHeight: 1.7, weight: 600 },
      align: 'center',
      color: '{{brand.fgHeading}}',
    }
    const inked = await render(browser, documentFor('rtl', ground, [text]), { bindings, reference: true, fonts: facesFor(family) })
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
