// The four export paths the seven cases run against — REQ-DSG-015, 06 §9.2.
//
// «The suite runs against EACH export path, not once globally.» Seven cases
// times four paths is the 28 assertions the M6 demonstrable names. Each path
// is a different way the same shaped text reaches a file, and each has its
// own way of going wrong:
//
//   1. poster PNG        — the screen path, as the spike proved it.
//   2. poster PDF        — the same document under PRINT emulation, which
//                          changes line breaking. That is the whole risk: a
//                          title that fits on screen and wraps on paper is
//                          not caught by path 1.
//   3. certificate PDF   — the Naskh face (Amiri) at cert_landscape. A
//                          different family with different GSUB coverage, on
//                          the artifact somebody frames.
//   4. slide page images — our PDF through poppler, the way a PDF material's
//                          pages are produced (07 §4.5, in the worker image
//                          since DEC-058). Needs poppler and cwebp on the
//                          PATH; skipped LOUDLY when they are missing.
//
// Paths 1-3 are measured in a DOM, so Tier A is 06 §9.3's structural
// comparison in full. PATH 4 IS MEASURED DIFFERENTLY AND THE DIFFERENCE IS
// STATED RATHER THAN HIDDEN: a page image out of poppler has no line boxes
// to read, so what is asserted there is that our PDF EMBEDS its faces and
// substitutes none (REQ-CRT-005's «renders on a machine with no fonts
// installed»), plus pixel parity against a reviewed golden. Claiming the
// same check on all four would be claiming a measurement nobody makes.

import { CASES, DEFAULT_FONT_SIZE, FAMILY } from './cases.mjs'

/** The Naskh face 06 §7.1 gives certificates. Present in packages/fonts
 *  since the lead's font commit; before it, path 3 has nothing to render. */
export const CERTIFICATE_FAMILY = 'Amiri'

export const PATHS = [
  {
    id: 'poster_png',
    label: 'poster PNG',
    family: FAMILY,
    print: false,
    tier: 'dom',
    /** Path 1's signatures live under `cases` in the golden file, where the
     *  spike put them, so adding the other three paths does not rewrite the
     *  baseline that has been green since M0. */
    goldenKey: null,
  },
  { id: 'poster_pdf', label: 'poster PDF', family: FAMILY, print: true, tier: 'dom', goldenKey: 'poster_pdf' },
  { id: 'certificate_pdf', label: 'certificate PDF', family: CERTIFICATE_FAMILY, print: true, tier: 'dom', goldenKey: 'certificate_pdf' },
  { id: 'slide_pages', label: 'slide page images', family: FAMILY, print: true, tier: 'poppler', goldenKey: 'slide_pages' },
]

export const ASSERTIONS = PATHS.length * CASES.length

/**
 * The document every path renders: the seven cases stacked, each with a
 * control in a face that certainly does not exist.
 *
 * The controls are parked with `position: FIXED`. As absolutely positioned
 * nowrap elements they overflowed LEFTWARD in RTL (one measured at x = -74),
 * growing scrollWidth past the viewport, shifting the scroll origin, and
 * making every element-relative screenshot capture the wrong region —
 * silently, producing blank goldens. Fixed elements contribute nothing to
 * scroll size (DEC-024).
 */
export function buildDocument({ family, pad = 12 }) {
  const layers = []
  let cursorY = 0
  for (const c of CASES) {
    const size = c.fontSize ?? DEFAULT_FONT_SIZE
    // Sized to the expected line count plus one line of slack: generous
    // enough never to clip a stacked mark (A30), tight enough that the
    // Tier B pixel ratio stays dense — a frame mostly full of white dilutes
    // the diff and hides a real difference under the 0.1% threshold.
    const h = Math.ceil(size * 1.7 * ((c.lines ?? 1) + 1)) + pad * 2
    layers.push({
      id: `case-${c.id}`,
      kind: 'text',
      frame: { x: 0, y: cursorY, w: c.width, h },
      text: { literal: c.text },
      font: { family, size, lineHeight: 1.7, letterSpacing: 0, weight: 400 },
      align: 'start',
      color: '#0B1220',
    })
    layers.push({
      id: `ctrl-${c.id}`,
      kind: 'text',
      frame: { x: 0, y: 0, w: c.width, h },
      text: { literal: c.text },
      font: { family: 'NoSuchArabicFace', size, lineHeight: 1.7, letterSpacing: 0, weight: 400 },
    })
    cursorY += h
  }

  return {
    schemaVersion: 1,
    purpose: 'poster',
    master: { width: 800, height: cursorY, unit: 'px' },
    direction: 'rtl',
    background: { type: 'solid', color: '#ffffff' },
    layers,
  }
}

export const CONTROL_CSS = (pad = 12) => `
  [data-layer^="ctrl-"]{
    position:fixed !important; top:-10000px !important; inset-inline-start:0 !important;
    width:auto !important; height:auto !important;
    white-space:nowrap; visibility:hidden; pointer-events:none;
  }
  .dr-text{padding:${pad}px}
`
