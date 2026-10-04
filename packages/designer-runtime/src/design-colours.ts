/**
 * The design's own colour constants — `REQ-DSG-033`, `REQ-DSG-021`, `DEC-242`
 * as the wave-24 re-colour amends it.
 *
 * ★★ WHY THIS FILE EXISTS, AND WHY IT IS NOT `brand.ts`.
 *
 * `brand.*` is an ORG'S colour: `ENT-brand_kits` lets an org override all ten
 * tokens, and `resolveBrand()` merges the override over the platform default.
 * That is right for «this org's canvas» and wrong for «the tangerine
 * colourway», which is a PLATFORM DESIGN IDENTITY — the thing the library card
 * «لقاء» *is*. An org must never be able to rebrand it, which is precisely why
 * these values are not brand tokens.
 *
 * They are not literals either. `0094`'s guard refuses a hex in a template
 * document and is right to (`DEC-127`'s reasoning): a literal is invisible
 * until someone changes a colour, and it makes `DEC-008`'s «one edit in one
 * place» aspirational. So the design's colours get their own binding
 * namespace, and this file is the one place they are defined.
 *
 * ★ HOW THE ERROR THAT MADE THIS NECESSARY HAPPENED, because it was not «the
 * design was not read». `DEC-242` §2 ruled these colours out by name — they
 * «are `--color-team-tangerine`, `--color-team-cyan` and `--color-team-violet`
 * … not platform accents», therefore unreachable, because a team colour cannot
 * bind. But `01-tokens.md` labels that table «Team colours (**proposal**; the
 * mapping to companies is the owner's to change)», and **cyan and violet sit
 * on the PLATFORM cards of `AdminTemplates.dc.html`** — where a team colour
 * cannot be, because a platform template is org-independent. A proposal was
 * cited as settled fact to disqualify the design's own palette. The lesson is
 * not «read the design»; it is **«check whether the thing you are citing is
 * settled»**.
 *
 * ★ WHAT THESE SEVEN ARE, and what they are not. They are the owner's palette
 * — «#121420, #35D0FF, #9B7CFF, #C6FF3D, #FF6E4F, #FF9A2E» — minus `#121420`
 * and plus the two neutrals the artboards draw.
 *
 *   · `#121420` is NOT here. It appears exactly twice in the whole design
 *     corpus — `AdminEmails.dc.html:40` and `AdminEmailAdd.dc.html:36` — both
 *     times as the pane BEHIND the 600 px email preview, i.e. studio chrome,
 *     and it is in no line of `01-tokens.md`. The design's artefact ink is
 *     `#0B0C12` (`--color-ink`), which is what `ink` below is.
 *   · `ink` and `bone` are here although no family uses them as a ground,
 *     because the artboards draw two neutral colourways — «ليلي» (ink ground,
 *     bone type, lime pill) and «ورقي» (bone ground, ink type) — that the five
 *     vivid families no longer carry. An org rebuilds either from the picker.
 *
 * ★ SCHEME-INDEPENDENT, unlike every `brand.*` token, and that is evidence
 * rather than convenience: tangerine is tangerine on both legs and the type on
 * it is ink on both (bone on a vivid ground is 1.05–2.77:1 — measured, and the
 * reason the artboard had no choice either). A value that needs no `scheme` is
 * not a brand token.
 *
 * ★ Every hex here is `01-tokens.md`'s, character for character. Nothing is
 * invented and nothing is a near-miss of a token that exists.
 */

/**
 * The design's colours, keyed by the binding they are reached through:
 * `{{design.tangerine}}` resolves to `DESIGN_COLOURS.tangerine`.
 *
 * ★ NAMED BY COLOUR, NOT BY ROLE. `design.groundMeetup` would be circular —
 * the family → colourway mapping belongs in `library.ts`'s `COLOURWAYS`, in
 * ONE place, so changing which family is cyan is one line there and not a
 * rename here. It also means a template author picking `design.cyan` in the
 * inspector gets cyan, which is the only thing a colour picker can honestly
 * promise.
 */
export const DESIGN_COLOURS = {
  /** `--color-team-tangerine`. The colourway the design draws at full size on
   *  `AdminDesignerElements.dc.html` and first in the library — the
   *  representative poster. */
  tangerine: '#FF9A2E',
  /** `--color-lime`. The product's primary accent; type on it is ink at
   *  16.52:1, the strongest pairing in the set. */
  lime: '#C6FF3D',
  /** `--color-coral`. A *status* colour in the app (`DEC-073`), which is why it
   *  may never be a brand token — and no obstacle to being a design one: a
   *  poster's ground carries no status. */
  coral: '#FF6E4F',
  /** `--color-team-cyan`. ★ The artboard's own: the platform card «لقاء». */
  cyan: '#35D0FF',
  /** `--color-team-violet`. ★ The artboard's own: the platform card «إعلان». */
  violet: '#9B7CFF',
  /** `--color-ink`. The type on every vivid ground, and the ground of the
   *  «ليلي» colourway. NOT `#121420` — see this file's header. */
  ink: '#0B0C12',
  /** `--color-bone`. The ground of the «ورقي» colourway and the type on
   *  «ليلي». */
  bone: '#F4F1EA',
} as const

export type DesignColourName = keyof typeof DESIGN_COLOURS

/** The names, for the inspector's swatch list and for `brandViolations()`'s
 *  membership check. Ordered vivid-then-neutral, as the picker shows them. */
export const DESIGN_COLOUR_NAMES = Object.keys(DESIGN_COLOURS) as DesignColourName[]

/** The namespace these are reached through. One constant rather than the
 *  string `'design'` in six files, so the grep that finds them all is the
 *  import list. */
export const DESIGN_NAMESPACE = 'design'

/**
 * A `design.<name>` binding's value, or `undefined` when the path is not one.
 *
 * ★ Consulted by `resolveColour()` rather than merged into a render context,
 * and the reason is the point of the whole file: a value that reaches no
 * per-org context **cannot be overridden by construction**. An org cannot
 * rebrand the tangerine colourway because there is no path by which a brand
 * kit could reach it — not because nobody implemented one. It also means the
 * worker, the studio and the parity harness all resolve these identically
 * without any of the four render-context assembly sites knowing they exist.
 *
 * `undefined` for an unknown name, so `resolveColour()` falls through to its
 * caller's fallback exactly as it does for `{{brand.canvsRaise}}` today.
 * Membership is `brandViolations()`'s job, as it already is for brand tokens —
 * the database guard checks the binding's SHAPE and this file's list is what
 * says a name exists.
 */
export function designColour(path: string): string | undefined {
  const dot = path.indexOf('.')
  if (dot < 0 || path.slice(0, dot) !== DESIGN_NAMESPACE) return undefined
  return (DESIGN_COLOURS as Record<string, string>)[path.slice(dot + 1)]
}
