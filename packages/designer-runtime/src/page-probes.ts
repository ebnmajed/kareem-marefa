/**
 * The two functions that run INSIDE a browser page — the editor's own
 * document and the worker's Chromium tab.
 *
 * EVERY FUNCTION IN THIS FILE IS SELF-CONTAINED: no imports, no closure over
 * module scope, no helpers from elsewhere. That is not style, it is the
 * contract: `page.evaluate(fn, args)` ships `fn.toString()` to the page, so a
 * reference to anything outside the body is `undefined is not a function` at
 * runtime, in the worker, on the one export nobody re-ran. Keeping them here
 * and keeping them closed is what lets the editor and the worker share one
 * text-measurement and one Tier-A probe instead of two that drift.
 *
 * The measurement probe carries the renderer's own typographic invariants,
 * because measuring with different CSS than the render uses is measuring a
 * different layout: `letter-spacing: 0` (A30 — spacing breaks the cursive
 * join), `overflow: visible` (a clipped probe under-reports its height, and a
 * stacked tashkeel is exactly what gets clipped) and `white-space: pre-wrap`.
 */

export interface MeasureRequest {
  text: string
  family: string
  weight: number
  size: number
  lineHeight: number
  maxWidth: number
  direction?: 'rtl' | 'ltr'
}

export interface TextMetrics {
  lines: number
  height: number
  width: number
}

/** One layer's post-shaping geometry. 06 §9.3: no browser exposes shaped
 *  glyph ids, so identity is measured through the geometry shaping PRODUCES —
 *  a dropped ligature, a substituted face or lost mark positioning all move
 *  these numbers. */
export interface LayerSignature {
  lineCount: number
  lineWidths: number[]
  totalAdvance: number
  charRectCount: number
  zeroWidthRects: number
  fontSize: string
  letterSpacing: string
  /** The same string in a face that certainly does not exist. Equal advance
   *  means the target face never loaded and every other number here is a
   *  measurement of a fallback — the most valuable single number in the
   *  signature, and the one an earlier version of the parity harness got
   *  wrong by comparing box widths instead of text advance (DEC-024). */
  fallbackAdvance: number
  distinctFromFallback: boolean
}

/* ────────────────────────────────────────────────────────────────────────
 * Probe 1 — measure a batch of candidate sizes.
 *
 * A BATCH, not one call per size: auto-fit searches integer steps downward
 * and the worker drives the page over a bridge, so sixty round-trips per text
 * layer becomes one. The editor calls it in-process, where the difference
 * does not matter but the shared definition does.
 * ──────────────────────────────────────────────────────────────────────── */
export function measureTextBatch(requests: MeasureRequest[]): TextMetrics[] {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  // `fixed`, off-screen. An absolutely positioned probe in an RTL document
  // overflows LEFTWARD, growing scrollWidth and shifting the scroll origin,
  // which makes every element-relative screenshot capture the wrong region —
  // silently, producing blank goldens. That happened twice (DEC-024). A fixed
  // element contributes nothing to scroll size.
  el.style.cssText =
    'position:fixed;top:-10000px;inset-inline-start:0;visibility:hidden;pointer-events:none;' +
    'letter-spacing:0;overflow:visible;white-space:pre-wrap;text-align:start;margin:0;padding:0;border:0'
  document.body.appendChild(el)

  const out: TextMetrics[] = []
  for (const r of requests) {
    el.dir = r.direction ?? 'rtl'
    el.style.fontFamily = "'" + r.family.replace(/[\\'"]/g, '\\$&') + "'"
    el.style.fontWeight = String(r.weight)
    el.style.fontSize = r.size + 'px'
    el.style.lineHeight = String(r.lineHeight)
    el.style.width = r.maxWidth + 'px'
    el.textContent = r.text

    const rect = el.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(el)
    // Client rects grouped by their top edge ARE the line boxes. A count read
    // from height / lineHeight rounds wrong on the last line whenever a mark
    // sits above the em box, which in Arabic is often.
    const tops: number[] = []
    const rects = range.getClientRects()
    for (let i = 0; i < rects.length; i++) {
      const cr = rects[i] as DOMRect
      if (cr.width <= 0) continue
      const top = Math.round(cr.top * 100) / 100
      if (tops.indexOf(top) === -1) tops.push(top)
    }
    out.push({ lines: Math.max(1, tops.length), height: rect.height, width: rect.width })
  }

  el.remove()
  return out
}

/* ────────────────────────────────────────────────────────────────────────
 * Probe 2 — the Tier A signature of a rendered document.
 *
 * Read from the page the capture is about to be taken from, so it describes
 * the bytes that ship rather than a separate measurement of the same
 * intention.
 * ──────────────────────────────────────────────────────────────────────── */
export function tierASignatureBatch(layerIds: string[]): Record<string, LayerSignature> {
  const round = (n: number) => Math.round(n * 100) / 100
  const out: Record<string, LayerSignature> = {}

  // One control element, reused: the same string in a face that does not
  // exist. Fixed and off-screen for the same RTL scroll-origin reason above.
  const control = document.createElement('div')
  control.setAttribute('aria-hidden', 'true')
  control.style.cssText =
    'position:fixed;top:-10000px;inset-inline-start:0;visibility:hidden;pointer-events:none;' +
    "white-space:nowrap;letter-spacing:0;font-family:'NoSuchArabicFace';margin:0;padding:0;border:0"
  document.body.appendChild(control)

  for (const id of layerIds) {
    const el = document.querySelector('[data-layer="' + id + '"]') as HTMLElement | null
    if (!el) continue
    // The renderer bidi-isolates text in <bdi> (REQ-INT-007), so the
    // measurable text node is inside it.
    const holder = (el.querySelector('bdi') as HTMLElement | null) ?? el
    const node = holder.firstChild
    if (!node || node.nodeType !== 3) continue
    const text = node.textContent ?? ''

    const style = getComputedStyle(el)
    control.style.fontSize = style.fontSize
    control.style.fontWeight = style.fontWeight
    control.textContent = text
    const fallbackAdvance = round(control.getBoundingClientRect().width)

    // Per-character rects. A ligature makes two code points share one box, so
    // the count DROPS when a ligature forms and rises when one is dropped —
    // which is how lam-alef is detected without a glyph dump.
    let charRectCount = 0
    let zeroWidthRects = 0
    for (let i = 0; i < text.length; i++) {
      const r = document.createRange()
      r.setStart(node, i)
      r.setEnd(node, i + 1)
      const rect = r.getBoundingClientRect()
      charRectCount++
      if (round(rect.width) === 0) zeroWidthRects++
    }

    const full = document.createRange()
    full.selectNodeContents(holder)
    const byTop: Record<string, number> = {}
    const rects = full.getClientRects()
    for (let i = 0; i < rects.length; i++) {
      const cr = rects[i] as DOMRect
      if (cr.width <= 0) continue
      const key = String(round(cr.top))
      byTop[key] = (byTop[key] ?? 0) + cr.width
    }
    const lineWidths = Object.keys(byTop)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => round(byTop[k] as number))
    const totalAdvance = round(lineWidths.reduce((s, w) => s + w, 0))

    out[id] = {
      lineCount: lineWidths.length,
      lineWidths,
      totalAdvance,
      charRectCount,
      zeroWidthRects,
      fontSize: style.fontSize,
      letterSpacing: style.letterSpacing,
      fallbackAdvance,
      // More than one line is itself proof the face resolved differently from
      // a nowrap control; on one line, the advances must differ.
      distinctFromFallback: lineWidths.length > 1 || Math.abs(totalAdvance - fallbackAdvance) > 1,
    }
  }

  control.remove()
  return out
}

/** The inked fraction of a capture. A blank golden passes every comparison
 *  forever and proves nothing, which is exactly what happened when
 *  `font-display: block` hid the glyphs while the metrics still resolved
 *  (DEC-024). Below 0.1% is a hard failure, never a warning. */
export function inkedRatio(base64Png: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('the capture could not be decoded'))
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = img.width
      cv.height = img.height
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      if (!ctx) return reject(new Error('no 2d context'))
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data
      let inked = 0
      for (let i = 0; i < d.length; i += 4) {
        if ((d[i] as number) < 240 || (d[i + 1] as number) < 240 || (d[i + 2] as number) < 240) inked++
      }
      resolve(inked / (d.length / 4))
    }
    img.src = 'data:image/png;base64,' + base64Png
  })
}

/* ────────────────────────────────────────────────────────────────────────
 * Probe 3 — advances for a list of strings in one family.
 *
 * Self-contained, like the others. Used to gate a newly materialised font
 * (REQ-DSG-017): the checks in `font-gate.ts` are COMPARATIVE, so they need
 * several strings measured in the same face rather than one signature.
 * ──────────────────────────────────────────────────────────────────────── */
export function advancesBatch(input: { family: string; size: number; texts: string[] }): number[] {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText =
    'position:fixed;top:-10000px;inset-inline-start:0;visibility:hidden;pointer-events:none;' +
    'white-space:nowrap;letter-spacing:0;overflow:visible;margin:0;padding:0;border:0'
  el.dir = 'rtl'
  el.style.fontFamily = "'" + input.family.replace(/[\\'"]/g, '\\$&') + "'"
  el.style.fontSize = input.size + 'px'
  document.body.appendChild(el)

  const out: number[] = []
  for (const text of input.texts) {
    el.textContent = text
    out.push(Math.round(el.getBoundingClientRect().width * 100) / 100)
  }
  el.remove()
  return out
}
