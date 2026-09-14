/**
 * Auto-fit — 06 §5.2, REQ-DSG-025, A30.
 *
 * Arabic runs roughly 1.2× the length of English and an Arabic title is
 * unpredictable in a way a Latin one is not, so a text box that fits the
 * designer's example overflows on the next session. The rule is
 * SHRINK → WRAP → WARN: shrink toward `minSize`, then wrap to `maxLines`,
 * then warn. Never silently clip, and never below the template's stated
 * minimum — a title at 20 px on an A3 poster is not a fitted title, it is an
 * unreadable one, and the template author said so by setting the minimum.
 *
 * TWO PROPERTIES THIS FILE EXISTS TO HOLD.
 *
 * It is a PURE function over an injected measurer. The editor measures with
 * the browser's DOM and the worker measures with Chromium's — the same engine
 * and the same font bytes — so the fitted size is the same number in both,
 * which is one of the things Tier A compares (06 §9.3: «same fitted size»).
 * A measurement baked into this module would be a second text engine.
 *
 * It searches in INTEGER PIXEL STEPS, downward, and takes the first size that
 * fits. Not a binary search and not a fractional one: two renderers agreeing
 * on 47.318 px is luck, and 06 §9.3's «not a tolerance — a structural
 * comparison» does not survive luck. Determinism is worth the extra
 * measurements on a box that is measured once per export.
 */

import type { AutoFit, FontSpec, Frame } from './model.js'

export interface MeasureRequest {
  text: string
  family: string
  weight: number
  /** Integer pixels. */
  size: number
  lineHeight: number
  /** The frame's width; wrapping happens against it. */
  maxWidth: number
}

export interface TextMetrics {
  /** Wrapped line boxes. */
  lines: number
  /** Total laid-out height, including the leading A30 asks for. */
  height: number
  /** The widest line. */
  width: number
}

export type TextMeasurer = (request: MeasureRequest) => TextMetrics

export type AutoFitWarning =
  /** At `minSize` and still taller than the frame. The template's minimum
   *  wins: the text is NOT shrunk further, and the export is flagged. */
  | 'min_size_reached'
  /** Within the frame but wrapped past `maxLines`. */
  | 'max_lines_exceeded'

export interface AutoFitResult {
  /** The size to render at. Never below `minSize`. */
  size: number
  lines: number
  height: number
  fits: boolean
  warning?: AutoFitWarning
}

export interface AutoFitInput {
  text: string
  frame: Pick<Frame, 'w' | 'h'>
  font: FontSpec
  autoFit?: AutoFit
}

/**
 * The fitted size for one text box.
 *
 * With no `autoFit` declared the template is stating a fixed size, so nothing
 * is shrunk — but the result still reports whether it fits, because
 * REQ-DSG-010 wants the overflow flagged before export either way.
 */
export function computeAutoFit(input: AutoFitInput, measure: TextMeasurer): AutoFitResult {
  const { text, frame, font, autoFit } = input
  const lineHeight = font.lineHeight ?? 1.7
  const weight = font.weight ?? 400
  const maxLines = autoFit?.maxLines
  const start = Math.max(1, Math.round(font.size))
  const floor = Math.max(1, Math.round(font.minSize ?? font.size))

  const at = (size: number) => measure({ text, family: font.family, weight, size, lineHeight, maxWidth: frame.w })

  const verdict = (size: number, m: TextMetrics): AutoFitResult => {
    const withinBox = m.height <= frame.h
    const withinLines = maxLines === undefined || m.lines <= maxLines
    if (withinBox && withinLines) return { size, lines: m.lines, height: m.height, fits: true }
    return {
      size,
      lines: m.lines,
      height: m.height,
      fits: false,
      // Which warning is which matters to the admin: «it will not get smaller»
      // and «it wrapped onto a fourth line» call for different fixes.
      warning: withinBox ? 'max_lines_exceeded' : 'min_size_reached',
    }
  }

  // No auto-fit: the size is the template's word, and overflow is reported.
  if (!autoFit) return verdict(start, at(start))

  for (let size = start; size >= floor; size--) {
    const m = at(size)
    if (m.height <= frame.h && (maxLines === undefined || m.lines <= maxLines)) {
      return { size, lines: m.lines, height: m.height, fits: true }
    }
  }

  // At the floor and still over. The minimum is not negotiable (REQ-DSG-025),
  // so this is a warning rather than a smaller font.
  return verdict(floor, at(floor))
}

/**
 * A measurer over a real DOM — the editor's `document` and the worker page's
 * are both this one, which is the point: the same code, the same engine, the
 * same bytes, so the fitted size cannot differ between what an admin approves
 * and what is printed (DEC-017).
 *
 * The probe carries the renderer's own typographic invariants, because
 * measuring with different CSS than the render uses is measuring a different
 * layout: `letter-spacing: 0` (A30 — spacing breaks the cursive join),
 * `overflow: visible` (a clipped probe under-reports its height and a stacked
 * tashkeel is exactly what gets clipped), and `white-space: pre-wrap`.
 */
export function domTextMeasurer(doc: Document, direction: 'rtl' | 'ltr' = 'rtl'): TextMeasurer {
  let probe: HTMLElement | null = null

  const element = (): HTMLElement => {
    if (probe?.isConnected) return probe
    const el = doc.createElement('div')
    el.setAttribute('aria-hidden', 'true');
    // `fixed`, off-screen: an absolutely positioned probe in an RTL document
    // overflows LEFTWARD, growing scrollWidth and shifting the scroll origin,
    // which made element screenshots capture the wrong region and produced
    // blank goldens twice (DEC-024). A fixed element contributes nothing to
    // scroll size.
    el.style.cssText =
      'position:fixed;top:-10000px;inset-inline-start:0;visibility:hidden;pointer-events:none;' +
      'letter-spacing:0;overflow:visible;white-space:pre-wrap;text-align:start;margin:0;padding:0;border:0';
    el.dir = direction
    doc.body.appendChild(el)
    probe = el
    return el
  }

  return ({ text, family, weight, size, lineHeight, maxWidth }) => {
    const el = element()
    el.style.fontFamily = `'${family.replace(/[\\'"]/g, '\\$&')}'`
    el.style.fontWeight = String(weight)
    el.style.fontSize = `${size}px`
    el.style.lineHeight = String(lineHeight)
    el.style.width = `${maxWidth}px`
    el.textContent = text

    const rect = el.getBoundingClientRect()
    const range = doc.createRange()
    range.selectNodeContents(el)
    // Client rects grouped by their top edge ARE the line boxes; a line count
    // read from `height / lineHeight` rounds wrong on the last line whenever
    // a mark sits above the em box, which in Arabic is often.
    const tops = new Set<number>()
    for (const r of Array.from(range.getClientRects())) {
      if (r.width > 0) tops.add(Math.round(r.top * 100) / 100)
    }
    return { lines: Math.max(1, tops.size), height: rect.height, width: rect.width }
  }
}
