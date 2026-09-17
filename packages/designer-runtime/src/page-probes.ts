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
  /** The same string in a face that certainly does not exist — the
   *  platform's own fallback. INFORMATIVE ONLY since wave 8: it used to
   *  decide whether the face loaded («advance within 1 px of the fallback's
   *  means it never loaded»), and a short word at a small size in IBM Plex
   *  Sans Arabic sits within 1 px of macOS's Arabic fallback — «جلسة»
   *  measured 92.09 against 92.59 — so a face that HAD loaded was refused.
   *  What decides now is `faceLoaded` and `coverageAdvances`, neither of
   *  which depends on what the platform falls back to (`faceResolved()`). */
  fallbackAdvance: number
  /** The layer's family is usable in `document.fonts`: among its faces at the
   *  layer's weight (else all of the family's — Amiri ships 400 and 700, and
   *  a 600 layer matches 700) one is `loaded` and none is `error`. A fetch or
   *  decode that failed leaves a face `error` — one corrupt subset is enough
   *  for its script to fall back — and a family nobody declared has no face
   *  at all. */
  faceLoaded: boolean
  /** The same string in the layer's own font-family list followed by two
   *  DIFFERENT generic fallbacks (`serif`, then `monospace`). When the family
   *  covers every character the fallback is never consulted and the two are
   *  identical, on any platform; a difference means some glyphs came from
   *  the fallback. */
  coverageAdvances: [number, number]
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
  // exist, then in the layer's own family over two different generics. Fixed
  // and off-screen for the same RTL scroll-origin reason above.
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
    control.style.fontFamily = "'NoSuchArabicFace'"
    control.style.fontSize = style.fontSize
    control.style.fontWeight = style.fontWeight
    control.style.fontStyle = style.fontStyle
    control.textContent = text
    const fallbackAdvance = round(control.getBoundingClientRect().width)

    // Coverage: the layer's own family list, then two different generics.
    // Identical when the family draws every glyph, whatever the platform
    // maps `serif` and `monospace` to.
    control.style.fontFamily = style.fontFamily + ', serif'
    const withSerif = round(control.getBoundingClientRect().width)
    control.style.fontFamily = style.fontFamily + ', monospace'
    const withMonospace = round(control.getBoundingClientRect().width)

    // Loaded: among the faces of the FIRST family (at the layer's weight when
    // any is declared there, else all of the family's — Amiri has no 600),
    // at least one is `loaded` and none is `error`. `error` matters because
    // a family is two faces per weight, its Arabic and Latin subsets: with
    // the Arabic one corrupt and the Latin one loaded, «جلسة» is drawn
    // entirely by the fallback — measured. `unloaded` is not a failure: a
    // subset the text never needed may never have been fetched.
    const unquote = (v: string) => v.trim().replace(/^["']|["']$/g, '')
    const family = unquote(style.fontFamily.split(',')[0] ?? '')
    const weight = Number(style.fontWeight) || 400
    const fontStyle = style.fontStyle || 'normal'
    const ofFamily: string[] = []
    const atWeight: string[] = []
    document.fonts.forEach((face) => {
      if (unquote(face.family) !== family) return
      if ((face.style || 'normal') !== fontStyle) return
      ofFamily.push(face.status)
      const range = String(face.weight).trim().split(/\s+/).map(Number)
      const lo = range[0] ?? 400
      const hi = range.length > 1 ? (range[1] ?? lo) : lo
      if (weight >= lo && weight <= hi) atWeight.push(face.status)
    })
    const pool = atWeight.length ? atWeight : ofFamily
    const faceLoaded = pool.indexOf('loaded') !== -1 && pool.indexOf('error') === -1

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
      faceLoaded,
      coverageAdvances: [withSerif, withMonospace],
    }
  }

  control.remove()
  return out
}

export interface InkInput {
  /** The capture, as a base64 PNG. */
  capture: string
  /** The SAME page with every layer hidden — its background alone, as a
   *  base64 PNG. Absent, ink is measured against white, which is right for
   *  a white page and nothing else. */
  reference?: string | null
}

/**
 * The inked fraction of a capture. A blank golden passes every comparison
 * forever and proves nothing, which is exactly what happened when
 * `font-display: block` hid the glyphs while the metrics still resolved
 * (DEC-024). Below 0.1% is a hard failure, never a warning.
 *
 * ★ INK IS WHAT DIFFERS FROM THE PAGE'S OWN BACKGROUND, not what is darker
 * than white. The first version counted any channel below 240 as ink, so on
 * a dark poster (DEC-125) or its gradient (DEC-127) EVERY pixel was ink, and
 * a poster whose text never painted read 100% inked and shipped. With a
 * reference capture of the same page and its layers hidden, a pixel is ink
 * when any channel differs from the reference by more than 2/255 — Tier B's
 * own per-channel tolerance — so the check holds on a solid fill, a gradient
 * and an image background alike.
 */
export function inkedRatio(input: InkInput): Promise<number> {
  const decode = (base64Png: string): Promise<{ data: ArrayLike<number>; width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onerror = () => reject(new Error('the capture could not be decoded'))
      img.onload = () => {
        const cv = document.createElement('canvas')
        cv.width = img.width
        cv.height = img.height
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        if (!ctx) return reject(new Error('no 2d context'))
        ctx.drawImage(img, 0, 0)
        resolve({ data: ctx.getImageData(0, 0, cv.width, cv.height).data, width: cv.width, height: cv.height })
      }
      img.src = 'data:image/png;base64,' + base64Png
    })

  return Promise.all([decode(input.capture), input.reference ? decode(input.reference) : Promise.resolve(null)]).then(([page, ref]) => {
    if (ref && (ref.width !== page.width || ref.height !== page.height)) {
      throw new Error('the reference capture is not the size of the capture')
    }
    const d = page.data
    const r = ref ? ref.data : null
    let inked = 0
    for (let i = 0; i < d.length; i += 4) {
      if (r) {
        if (
          Math.abs((d[i] as number) - (r[i] as number)) > 2 ||
          Math.abs((d[i + 1] as number) - (r[i + 1] as number)) > 2 ||
          Math.abs((d[i + 2] as number) - (r[i + 2] as number)) > 2
        ) {
          inked++
        }
      } else if ((d[i] as number) < 240 || (d[i + 1] as number) < 240 || (d[i + 2] as number) < 240) {
        inked++
      }
    }
    return inked / (d.length / 4)
  })
}

/** The stylesheet that turns a rendered page into its own reference: every
 *  layer hidden, layout untouched (`visibility`, never `display`), so the
 *  background pixels are exactly the capture's. A string rather than a probe,
 *  because it is injected, not evaluated. */
export const INK_REFERENCE_CSS = '.dr-layer{visibility:hidden !important}'

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
