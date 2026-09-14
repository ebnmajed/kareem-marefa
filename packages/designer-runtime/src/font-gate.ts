/**
 * The gate a newly materialised font must pass — REQ-DSG-017, A39, 06 §7.2.
 *
 * «A font with partial GSUB or mark coverage renders Latin perfectly and
 * SILENTLY BREAKS lam-alef and stacked tashkeel. A Latin smoke test passes
 * it. Only the Arabic goldens catch it.»
 *
 * THE CHECKS HERE ARE COMPARATIVE, NOT GOLDEN-BASED, and that is the whole
 * design. A new font has no golden to compare against — it has never been
 * rendered before — so asking "does this match what we recorded?" is a
 * question with no answer. What CAN be asked of any correct Arabic face,
 * whatever its metrics:
 *
 *   1. **The face loaded at all.** Its advance differs from the same string
 *      in a face that certainly does not exist.
 *   2. **Lam-alef forms a LIGATURE.** «لا» must be narrower than «ل» plus
 *      «ا» measured apart. A face missing `rlig`/`liga` draws two separate
 *      letters, and the sum is what you get.
 *   3. **Marks are ZERO-ADVANCE.** «مُحَمَّدٌ» must be no wider than «محمد».
 *      A face missing `mark`/`mkmk` lays its diacritics out as spacing
 *      glyphs, which both widens the word and stacks them beside the
 *      letters instead of above them.
 *   4. **Arabic is actually covered.** The Arabic string is not rendered at
 *      the same width as a tofu run.
 *
 * Every one of those is a property of correct shaping rather than of a
 * particular typeface, so the same gate admits Amiri, Reem Kufi and a
 * family nobody has picked yet.
 */

/** The strings the probe must measure, in this order. */
export const FONT_GATE_TEXTS = [
  'لا', // 0 — the ligature
  'ل', // 1 — its first letter alone
  'ا', // 2 — its second letter alone
  'محمد', // 3 — bare bases
  'مُحَمَّدٌ', // 4 — the same bases with stacked marks
  'جلسة عن Next.js', // 5 — mixed script, for coverage
] as const

export interface FontGateFinding {
  check: 'face_loaded' | 'lam_alef_ligature' | 'mark_positioning' | 'arabic_coverage'
  passed: boolean
  detail: string
}

export interface FontGateResult {
  passed: boolean
  findings: FontGateFinding[]
}

/**
 * @param advances  measurements of FONT_GATE_TEXTS in the candidate face
 * @param fallback  the same measurements in a face that does not exist
 */
export function checkFontShaping(advances: readonly number[], fallback: readonly number[]): FontGateResult {
  const findings: FontGateFinding[] = []
  const a = (i: number) => advances[i] ?? 0
  const f = (i: number) => fallback[i] ?? 0

  const loaded = Math.abs(a(3) - f(3)) > 1 || Math.abs(a(5) - f(5)) > 1
  findings.push({
    check: 'face_loaded',
    passed: loaded,
    detail: loaded ? `advance ${a(3)} differs from the fallback's ${f(3)}` : `advance ${a(3)} equals the fallback's — the face never resolved`,
  })

  // A ligature is NARROWER than its parts. Tolerance of 1 px absorbs
  // subpixel rounding without admitting a face that simply drew both.
  const apart = a(1) + a(2)
  const ligature = a(0) < apart - 1
  findings.push({
    check: 'lam_alef_ligature',
    passed: ligature,
    detail: ligature
      ? `«لا» is ${a(0)} against ${apart} for its letters apart`
      : `«لا» is ${a(0)} and its letters apart are ${apart} — rlig/liga appears to be missing`,
  })

  // Marks carry no advance. A face that lays them out as spacing glyphs
  // widens the word, and that is the tell.
  const marksFree = a(4) <= a(3) + 1
  findings.push({
    check: 'mark_positioning',
    passed: marksFree,
    detail: marksFree
      ? `«مُحَمَّدٌ» is ${a(4)} against ${a(3)} unmarked`
      : `«مُحَمَّدٌ» is ${a(4)} against ${a(3)} unmarked — mark/mkmk appears to be missing, so the diacritics take width`,
  })

  const covered = a(3) > 0 && Math.abs(a(3) - f(3)) > 1
  findings.push({
    check: 'arabic_coverage',
    passed: covered,
    detail: covered ? 'the Arabic run is shaped by this face' : 'the Arabic run measures as a fallback — the face has no Arabic coverage',
  })

  return { passed: findings.every((x) => x.passed), findings }
}

/** One line for the admin: 06 §7.2 wants a REFUSAL WITH AN ANSWER, naming
 *  which checks failed rather than saying the font is unavailable. */
export function describeFontGate(result: FontGateResult): string {
  const failed = result.findings.filter((x) => !x.passed)
  if (!failed.length) return 'every shaping check passed'
  return failed.map((x) => `${x.check}: ${x.detail}`).join(' · ')
}
