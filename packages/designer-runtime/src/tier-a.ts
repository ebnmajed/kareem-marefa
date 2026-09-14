/**
 * Tier A — the check that runs on every production export, and FAILS it.
 * D66, REQ-DSG-014, DEC-017, 06 §9.1 and §9.3.
 *
 * WHAT IT COMPARES, STATED PLAINLY, because a parity check nobody can
 * describe is a parity check nobody can trust.
 *
 * The worker measures each text box to decide its fitted size (auto-fit,
 * REQ-DSG-025), then lays the document out and captures it. Tier A compares
 * the LAYOUT AS CAPTURED against the DECISION THAT PRODUCED IT, plus three
 * absolute conditions. A mismatch fails the export rather than shipping it.
 *
 *   1. **The face actually loaded.** Each text layer's advance is compared
 *      against the same string in a face that certainly does not exist. Equal
 *      means the target face never resolved, and every other number is a
 *      measurement of a fallback. This is the single most valuable check
 *      here: a font that fails to load produces a plausible-looking poster
 *      with silently wrong Arabic, which is the D66 nightmare in one
 *      sentence.
 *   2. **Letter-spacing is zero.** A30. Spacing Arabic breaks the cursive
 *      join, so a spaced word is a BROKEN word, and nothing downstream
 *      recovers from it.
 *   3. **The fitted size and line count survived.** The measurement said 64 px
 *      on two lines; if the laid-out page says 64 px on three, something
 *      changed between measuring and painting — a face substituted, a
 *      stylesheet late-applied, a subset missing a glyph and falling through.
 *   4. **Against the previous render of the same fingerprint**, when there is
 *      one. Same document, same template version, same bound data, same font
 *      bytes must give the same geometry; if it does not, something outside
 *      the fingerprint changed, and that is precisely the drift D66 is about.
 *
 * WHAT IT DOES NOT PROVE: that the shaping is CORRECT. Nothing at export time
 * can — correctness is the parity suite's seven cases against reviewed
 * goldens (REQ-DSG-015). Tier A proves the export matches what was decided,
 * which is the failure that reaches a printed page.
 */

import type { LayerSignature } from './page-probes.js'

export type TierASignature = Record<string, LayerSignature>

export interface TierAExpectation {
  layerId: string
  /** The size auto-fit settled on. */
  fittedSize: number
  /** The line count the measurement predicted. */
  lines: number
}

export interface TierAFailure {
  layerId: string
  code: 'font_never_loaded' | 'letter_spacing' | 'fitted_size' | 'line_count' | 'geometry_drift' | 'layer_missing'
  /** Human-readable, for `export_artifacts.error` and the admin's retry. */
  detail: string
}

/** Structural, not tolerant (06 §9.3): these are counts and exact strings. */
export function checkTierA(signature: TierASignature, expectations: readonly TierAExpectation[]): TierAFailure[] {
  const failures: TierAFailure[] = []

  for (const expected of expectations) {
    const actual = signature[expected.layerId]
    if (!actual) {
      failures.push({ layerId: expected.layerId, code: 'layer_missing', detail: 'the layer is not in the rendered page' })
      continue
    }

    if (!actual.distinctFromFallback) {
      failures.push({
        layerId: expected.layerId,
        code: 'font_never_loaded',
        detail: `advance ${actual.totalAdvance} equals the fallback's ${actual.fallbackAdvance} — the face never resolved`,
      })
      // Everything below would measure the fallback, so it is not worth
      // reporting three more failures for one cause.
      continue
    }

    if (actual.letterSpacing !== 'normal' && actual.letterSpacing !== '0px') {
      failures.push({
        layerId: expected.layerId,
        code: 'letter_spacing',
        detail: `letter-spacing is ${actual.letterSpacing}; Arabic must be 0 (A30)`,
      })
    }

    const rendered = Math.round(Number.parseFloat(actual.fontSize))
    if (Number.isFinite(rendered) && rendered !== Math.round(expected.fittedSize)) {
      failures.push({
        layerId: expected.layerId,
        code: 'fitted_size',
        detail: `auto-fit chose ${expected.fittedSize}px, the page laid out ${actual.fontSize}`,
      })
    }

    if (actual.lineCount !== expected.lines) {
      failures.push({
        layerId: expected.layerId,
        code: 'line_count',
        detail: `auto-fit predicted ${expected.lines} line(s), the page laid out ${actual.lineCount}`,
      })
    }
  }

  return failures
}

/**
 * The same source rendered twice must give the same geometry. Compared only
 * when a previous artifact with THIS fingerprint exists — the fingerprint
 * already covers the document, the template version, the bound data and the
 * font hashes, so a difference here means something outside all four moved.
 */
export function compareTierA(previous: TierASignature, current: TierASignature): TierAFailure[] {
  const failures: TierAFailure[] = []
  for (const [layerId, before] of Object.entries(previous)) {
    const after = current[layerId]
    if (!after) {
      failures.push({ layerId, code: 'layer_missing', detail: 'present in the previous render of this fingerprint, absent now' })
      continue
    }
    const keys = ['lineCount', 'totalAdvance', 'charRectCount', 'zeroWidthRects', 'fontSize'] as const
    const moved = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    if (JSON.stringify(before.lineWidths) !== JSON.stringify(after.lineWidths)) moved.push('lineWidths' as never)
    if (moved.length) {
      failures.push({
        layerId,
        code: 'geometry_drift',
        detail: `${moved.join(', ')} changed for an unchanged source fingerprint`,
      })
    }
  }
  return failures
}

/** One line for `export_artifacts.error`, and for the admin's retry screen. */
export function describeTierA(failures: readonly TierAFailure[]): string {
  return failures.map((f) => `${f.layerId}: ${f.code} — ${f.detail}`).join(' · ')
}
