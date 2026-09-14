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
 * The DECISION is pure and the MEASUREMENT is injected. The editor measures
 * with the browser's DOM and the worker measures with Chromium's — the same
 * engine and the same font bytes — so the fitted size is the same number in
 * both, which is one of the things Tier A compares (06 §9.3: «same fitted
 * size»). A measurement baked in here would be a second text engine.
 *
 * It searches in INTEGER PIXEL STEPS, downward, and takes the first size that
 * fits. Not a binary search and not a fractional one: two renderers agreeing
 * on 47.318 px is luck, and «not a tolerance — a structural comparison» does
 * not survive luck. Determinism is worth the extra measurements on a box
 * measured once per export.
 */

import type { AutoFit, FontSpec, Frame } from './model.js'
import { measureTextBatch, type MeasureRequest, type TextMetrics } from './page-probes.js'

export type { MeasureRequest, TextMetrics } from './page-probes.js'

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
  direction?: 'rtl' | 'ltr'
}

/**
 * Every size to try, largest first. Exposed because the worker drives the
 * page over a bridge: measuring sixty candidates in one `page.evaluate` is
 * one round-trip instead of sixty, and the search stays identical either way
 * because the CANDIDATES are the same list.
 */
export function autoFitCandidates(input: AutoFitInput): number[] {
  const start = Math.max(1, Math.round(input.font.size))
  if (!input.autoFit) return [start]
  const floor = Math.max(1, Math.round(input.font.minSize ?? input.font.size))
  const out: number[] = []
  for (let size = start; size >= floor; size--) out.push(size)
  return out.length ? out : [start]
}

/** The measurement request for one candidate. One shape, so the editor and
 *  the worker cannot ask the page two different questions. */
export function autoFitRequest(input: AutoFitInput, size: number): MeasureRequest {
  return {
    text: input.text,
    family: input.font.family,
    weight: input.font.weight ?? 400,
    size,
    lineHeight: input.font.lineHeight ?? 1.7,
    maxWidth: input.frame.w,
    direction: input.direction ?? 'rtl',
  }
}

/**
 * The decision, given the candidates' measurements in the same order. Pure:
 * no DOM, no async, testable with a table.
 */
export function pickAutoFit(input: AutoFitInput, candidates: readonly number[], metrics: readonly TextMetrics[]): AutoFitResult {
  const maxLines = input.autoFit?.maxLines

  for (let i = 0; i < candidates.length; i++) {
    const m = metrics[i]
    const size = candidates[i]
    if (!m || size === undefined) continue
    if (m.height <= input.frame.h && (maxLines === undefined || m.lines <= maxLines)) {
      return { size, lines: m.lines, height: m.height, fits: true }
    }
  }

  // Nothing fit. The floor is the last candidate, and the template's minimum
  // is not negotiable (REQ-DSG-025) — so this warns rather than shrinking.
  const last = candidates.length - 1
  const size = candidates[last] ?? Math.round(input.font.size)
  const m = metrics[last] ?? { lines: 1, height: 0, width: 0 }
  return {
    size,
    lines: m.lines,
    height: m.height,
    fits: false,
    // Which warning is which matters to the admin: «it will not get smaller»
    // and «it wrapped onto a fourth line» call for different fixes.
    warning: m.height <= input.frame.h ? 'max_lines_exceeded' : 'min_size_reached',
  }
}

/**
 * The synchronous convenience, for a caller that can measure in-process — the
 * editor, and any test with a table-driven measurer.
 *
 * With no `autoFit` declared the template is stating a fixed size, so nothing
 * is shrunk — but the result still reports whether it fits, because
 * REQ-DSG-010 wants the overflow flagged before export either way.
 */
export function computeAutoFit(input: AutoFitInput, measure: TextMeasurer): AutoFitResult {
  const candidates = autoFitCandidates(input)
  const metrics: TextMetrics[] = []
  for (const size of candidates) {
    const m = measure(autoFitRequest(input, size))
    metrics.push(m)
    // Stop at the first that fits: measuring the rest would be work for an
    // answer already known, and `pickAutoFit` takes the first anyway.
    if (m.height <= input.frame.h && (input.autoFit?.maxLines === undefined || m.lines <= input.autoFit.maxLines)) break
  }
  return pickAutoFit(input, candidates.slice(0, metrics.length), metrics)
}

/**
 * A measurer over a real DOM. Both the editor's `document` and the worker
 * page's go through `measureTextBatch`, the one self-contained probe in
 * `page-probes.ts` — the same code, the same engine, the same bytes, so the
 * fitted size cannot differ between what an admin approves and what is
 * printed (DEC-017).
 */
export function domTextMeasurer(_doc: Document, direction: 'rtl' | 'ltr' = 'rtl'): TextMeasurer {
  return (request) => {
    const [only] = measureTextBatch([{ ...request, direction: request.direction ?? direction }])
    return only ?? { lines: 1, height: 0, width: 0 }
  }
}
