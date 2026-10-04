/**
 * The baseline template library — REQ-DSG-026 (as `DEC-242` amends it),
 * REQ-DSG-033, REQ-CRT-016, A27, 06 §3.3, DEC-125, DEC-128, DEC-148, DEC-242.
 *
 * ★★ WAVE 24 (M26, `DEC-242`) REBUILT EVERY DOCUMENT IN THIS FILE to «ساحة
 * اللعب». Until this wave an exported poster and an issued certificate wore
 * M6's Reem Kufi on navy while every screen around them had worn the
 * playground since wave 17 — «the playground stops at the certificate's edge»
 * (DEC-183 §4) was a deferral, and this is the file that discharges it. The
 * design is the SEVEN CARD THUMBNAILS on `docs/design/screens/m12/
 * AdminTemplates.dc.html` and `AdminTemplatesCerts.dc.html`; there is no
 * artboard for a poster or a certificate, and `DEC-242` §1 is the table.
 *
 * ★ `REQ-DSG-026`'s four superseded VISUAL clauses, named in `01-prd.md`: the
 * gradient background (now a flat ground), the workshop's tasks strip (not
 * drawn), formal Naskh on a certificate (now the display face), and the
 * Knowledge Network as the visual language. Its STRUCTURE stands: five poster
 * families, three certificate families × two orientations, the counted
 * roster, Western numerals, locked regions.
 *
 * THE BRAND CONSTRAINT still holds, and is why this file is data rather than
 * pictures: no open books, no graduation caps, no lightbulbs, no traditional
 * education iconography, no cartoon illustration — and by project policy no
 * icon libraries, no emoji, no photography. The only image layer anywhere is
 * the ORG LOGO, which binds `brand.logoAssetId` rather than embedding
 * anything, which is what makes replacing a logo update every template at
 * once (06 §8.3) and what keeps `REQ-DSG-019`'s A3 resolution guard a subject.
 * ★ The thumbnails draw no logo; the owner KEPT it (wave 24 ruling 2 — «a
 * 196 px preview is not an inventory»), moved to the block-start inline-end so
 * it sits opposite the composition rather than inside it.
 *
 * ★★ TWO CONSTRAINTS THAT BOUND EVERY CHOICE BELOW, both measured first.
 *
 *   1. EVERY DOCUMENT DECLARES `BASE_SCHEMA_VERSION`. `SCHEMA_VERSION` is 2
 *      and `main`'s worker refuses a document whose version it does not know
 *      (`schema_version_future`, DEC-178's D2b). The owner pushes a migration
 *      BEFORE merging, so `main`'s worker runs these rows with `main`'s code
 *      for the whole window — a bumped document would fail EVERY poster
 *      render in it. So no new model field that changes a rendered byte: the
 *      category pill is a stadium composed from `ellipse` + `rect` +
 *      `ellipse` because `shape` has no radius, and the serial carries
 *      `<bdi>` (which `render.ts` already emits) and not `dir="ltr"`.
 *   2. EVERY COLOUR IS `{{brand.<token>}}` OR `{{design.<name>}}` AND NOTHING
 *      ELSE. `0094`'s guard is an ALLOWLIST of the binding shape —
 *      `^\{\{\s*(brand|design)\.[A-Za-z]+\s*\}\}$` — not a denylist of hex, so
 *      `rgb()`, `navy`, `#FF9A2E` and `{{team.colour}}` are all still refused.
 *      ★ The `design` branch is wave 24's and is the ONLY thing the guard
 *      newly admits: the new pattern is the old one with the literal `brand`
 *      replaced by an alternation, so the set of newly-accepted strings is
 *      exactly the well-formed `design` bindings and nothing else. The ten
 *      `BRAND_COLOUR_TOKENS` and the seven `DESIGN_COLOURS` are the whole
 *      vocabulary.
 *
 * ★★ THE FIVE COLOURWAYS (wave 24's re-colour, and what it corrected).
 *
 * ★ THE FIRST ATTEMPT WAS WRONG, and the diagnosis is worth keeping because it
 * is not «the design was not read». `DEC-242` §1 declared «there is no artboard
 * for a poster», and §2 ruled the design's own grounds out by name — they «are
 * `--color-team-tangerine`, `--color-team-cyan` and `--color-team-violet` …
 * not platform accents», therefore unreachable, because a team colour cannot
 * bind. Two things were wrong with that:
 *
 *   · `AdminDesignerElements.dc.html` IS the poster artboard. Its `<title>` is
 *     «ساحة اللعب — لون الفريق» — the name of library card 1 — and it draws the
 *     poster at 640×360 on `#FF9A2E` with `#0B0C12` type. It was always the
 *     same specification, at full size.
 *   · `01-tokens.md` labels that table «Team colours (**proposal**; the mapping
 *     to companies is the owner's to change)», and **cyan and violet sit on the
 *     PLATFORM cards** of `AdminTemplates.dc.html` — where a team colour cannot
 *     be, because a platform template is org-independent. A proposal was cited
 *     as settled fact to disqualify the design's own palette. The lesson is not
 *     «read the design»; it is **«check whether the thing you are citing is
 *     settled»**.
 *
 * ★ WHAT THE ARTBOARDS ACTUALLY DRAW — five colourways, THREE VIVID AND TWO
 * NEUTRAL, in two labelled sections:
 *
 *   قوالب مؤسستك · 3   ساحة اللعب — لون الفريق  `#FF9A2E` on ink
 *                      ليلي                     ink ground, bone type, LIME pill
 *                      ورقي                     bone ground, ink type
 *   قوالب المنصة · 2   لقاء      ★ `#35D0FF` cyan on ink   → `meetup`
 *                      إعلان     ★ `#9B7CFF` violet on ink → `announcement`
 *
 * ★★ SO FIVE VIVID FAMILIES IS THE OWNER'S INSTRUCTION, NOT THE DESIGN'S —
 * «I need the new design to match the design» plus the six hexes they handed
 * over. Writing «the design specifies five vivid colourways» would be the same
 * error a fourth time. What the design DOES fix is two of the five, and those
 * two are not ours to move: «لقاء» is cyan and «إعلان» is violet, by name, on
 * the platform cards. The other three are the remaining palette, and
 * `workshop`/`panel` were a free choice between lime and coral.
 *
 *   talk          `design.tangerine`  — the colourway drawn at full size
 *   workshop      `design.lime`
 *   panel         `design.coral`
 *   meetup        `design.cyan`       ★ the artboard, by name
 *   announcement  `design.violet`     ★ the artboard, by name
 *
 * Type on every one is `design.ink`; the pill is ink filled with the ground
 * colour as its type — the artboard's rule on all four vivid cards. Measured:
 * ink on tangerine 9.22:1, lime 16.52, cyan 10.80, violet 6.25, coral 7.06.
 * Bone on a vivid ground is 1.05–2.77:1, so **ink is the only possible type
 * colour** and the artboard had no choice either.
 *
 * ★★ TWO DEFECTS IN THE SHIPPED VERSION THIS REPLACES, both measured.
 *
 *   1. THREE OF THE FIVE WERE THE SAME POSTER. `talk`→`canvas` `#0B0C12`,
 *      `panel`→`surface` `#151724` and `meetup`→`canvasRaise` `#1E2130` are
 *      within 1.10:1, 1.22:1 and 1.11:1 of one another — same hue, same
 *      luminance, indistinguishable in print. `roster.variants` passed them
 *      because it only asks «does every colour resolve», never «are these five
 *      different». `roster.poster_ground` now asserts five DISTINCT RESOLVED
 *      grounds, which is the assertion that would have caught it.
 *   2. `workshop` BOUND `fgHeading` AS A GROUND — a foreground token painting a
 *      page, with `canvas` as its type. It only looked right because the dark
 *      leg's `fgHeading` happens to be bone; an org that rebranded its heading
 *      colour would have got a poster whose GROUND was it. Nothing checked
 *      that, because resolvability is not semantics.
 *
 * ★ THE LOSS, recorded in words because it is real: a baseline poster's ground
 * is now a PLATFORM DESIGN CONSTANT, so an org's brand kit no longer repaints
 * it. An org that wants its own colours **copies the template and picks a
 * `brand.*` token from the inspector**, which is what the artboard itself
 * shows — the org's three cards are different colourways from the platform's
 * two, and card 1 is named «لون الفريق». `REQ-DSG-021` still holds: one
 * definition, one edit, one place. ★ And the third tier the design wants —
 * `{{team.*}}` for «لون الفريق» — is now one word in the guard away, which is
 * the other reason the namespace is an alternation rather than a second
 * hard-coded prefix.
 *
 * VERSIONS AND ROWS (REQ-DSG-007, REQ-CRT-014, REQ-DSG-034). ★ The re-colour
 * is **VERSION 2 ON THE ELEVEN ROWS THE WAVE ALREADY CREATED**, not eleven more
 * rows, and the distinction matters. The wave's first seed needed new rows
 * because `REQ-DSG-034` required M6's baseline to LEAVE the library — there was
 * something to remove. Here there is not: the eleven rows are the right rows
 * with the wrong document inside them, so the fix is the pattern `0061` and
 * `0098` already used — **a version is ADDED, never edited** — and nothing is
 * superseded, deleted or retired. A certificate issued against version 1
 * renders as version 1 for ever (`REQ-CRT-014`), which is the whole reason a
 * version is immutable; issuance and `poster_render_context()` read the latest,
 * so every new export is the designed one.
 *
 * A ROW IS A COMPOSITION (DEC-148): the SCHEME is a palette chosen where the
 * render is decided (a poster is always `dark`, DEC-125; a certificate pins
 * its own, DEC-148) and is never a row; the ORIENTATION is a composition,
 * because `derive()` put a landscape certificate into the top 29 % of a
 * portrait page with a 157 mm empty band under it (measured), so each is its
 * own document and the document's own master says which it is.
 *
 * The LTR mirror A27 reserves for English is not a second document: every
 * alignment here is logical and every inset is measured from the safe box.
 */

import { declaredBindingsOf } from './bindings.js'
import { BRAND_COLOUR_TOKENS } from './brand.js'
import { DESIGN_COLOUR_NAMES } from './design-colours.js'
import type { DesignDocument, Layer } from './model.js'
import { BASE_SCHEMA_VERSION } from './model.js'
import { PRESETS } from './presets.js'

export type PosterFamily = 'talk' | 'workshop' | 'panel' | 'meetup' | 'announcement'
export type CertificateFamily = 'attendance' | 'presenter' | 'achievement'
export type CertificateOrientation = 'landscape' | 'portrait'

export interface BaselineTemplate {
  family: PosterFamily | CertificateFamily
  purpose: 'poster' | 'certificate'
  /** A certificate's composition. Posters derive every preset from one 4:5
   *  master and have none. Always equal to what the document's master says
   *  (`orientationOf`), which a test holds. */
  orientation?: CertificateOrientation
  /** The Arabic name an admin sees in the library (06 §3.3's own table). */
  name: string
  /** The version of the platform template this document is. */
  version: number
  /** The platform default for its (purpose, family): every poster family and
   *  the LANDSCAPE certificates. One default per family is the database's
   *  own rule (`design_templates_platform_default`). */
  isDefault: boolean
  document: DesignDocument
}

/** Landscape or portrait, from the document itself. */
export function orientationOf(document: Pick<DesignDocument, 'master'>): CertificateOrientation {
  return document.master.width >= document.master.height ? 'landscape' : 'portrait'
}

/** What a template version declares as its dynamic fields: every binding the
 *  document names except the brand colours, which are the brand kit's, not
 *  data (06 §2.3). The org logo stays — it is bound, like data. */
export function dynamicFieldsOf(document: DesignDocument): string[] {
  // ★ `design.*` is excluded for the same reason `brand.*` is: it is a colour
  //   the platform supplies, not a value an admin fills in. Missed, every
  //   design colour would land in the `dynamic_fields` COLUMN and appear in the
  //   editor's field panel as a bindable field.
  return declaredBindingsOf(document).filter(
    (b) => (!b.startsWith('brand.') && !b.startsWith('design.')) || b === 'brand.logoAssetId',
  )
}

/* ── the shared vocabulary ──────────────────────────────────────────────── */

/** ★ The display face, «ساحة اللعب»'s own (`docs/design/02-type.md`, and the
 *  thumbnails' `font-family: 'Baloo Bhaijaan 2'`). It replaces Reem Kufi on a
 *  poster and Amiri on a certificate — `REQ-DSG-026`'s «formal Naskh» is one
 *  of the four clauses `DEC-242` supersedes. Both weights are in the one font
 *  set by SHA-256 (`packages/fonts/manifest.json`, invariant 12); nothing is
 *  added to it by this wave. */
const DISPLAY = 'Baloo Bhaijaan 2'
/** The body face, unchanged — a certificate's small print is not display type. */
const BODY = 'IBM Plex Sans Arabic'

/** ★ The title's line height, from the thumbnails: `line-height: 1.12`. Tight
 *  on purpose — a display face at 96 px over three lines at 1.4 reads as a
 *  paragraph rather than a title. A30's «Arabic needs 10-15 % more leading»
 *  governs BODY text, which keeps 1.7; a 96 px display line is not body text,
 *  and the marks still have room because nothing clips a line (`BASE_CSS`). */
const TITLE_LEADING = 1.12

/** The org logo. Bound, never embedded: replacing it updates every template at
 *  once (06 §8.3), and `REQ-DSG-019`'s PPI guard has a subject because of it. */
const logo = (frame: Layer['frame']): Layer => ({
  id: 'l_logo',
  kind: 'image',
  name: 'شعار المؤسسة',
  image: { binding: 'brand.logoAssetId', fit: 'contain' },
  frame,
  // ★ `inlineAnchor: 'end'` — the logo is the block-start INLINE-END corner, and
  //   it should still be that corner on a page of a different aspect. Without it
  //   a 4:5 → 16:9 derivation put it 40 % across with the page's outer 60 %
  //   empty.
  //
  // ★ The certificate shares this helper and puts its logo at the inline-START,
  //   inside the lockup — and needs no override, measured: a certificate derives
  //   to exactly ONE preset, its own master, so the factor is 1 and holding the
  //   distance from the inline-end reproduces the authored x to the pixel.
  presets: { default: { anchor: 'block-start', inlineAnchor: 'end', scale: 'proportional' } },
  z: 10,
})

/**
 * The category pill — a STADIUM, composed from two ellipses and a rectangle.
 *
 * ★ The thumbnails draw `border-radius: 999px`, and `ShapeLayer.shape` carries
 * `type`, `fill`, `stroke` and `strokeWidth` and no radius. Adding one would
 * change a rendered byte, which by `DEC-178`'s D2b precedent needs a
 * `schemaVersion` bump — and a bumped document is refused by `main`'s worker
 * for the whole window between the owner's push and the merge, so every poster
 * render would fail. Three shapes at schema 1 cost nothing at render and are
 * exact.
 *
 * The caps are `h × h` ellipses at each end and the body is the span between
 * their centres, so the silhouette is a true stadium at any height.
 */
function pill(x: number, y: number, w: number, h: number, fill: string): Layer[] {
  const r = Math.round(h / 2)
  const base = { name: 'خلفية التصنيف', presets: { default: { anchor: 'block-start' as const, scale: 'proportional' as const } }, z: 2 }
  return [
    { ...base, id: 'l_pill_start', kind: 'shape', frame: { x, y, w: h, h }, shape: { type: 'ellipse', fill } },
    { ...base, id: 'l_pill_body', kind: 'shape', frame: { x: x + r, y, w: w - h, h }, shape: { type: 'rect', fill } },
    { ...base, id: 'l_pill_end', kind: 'shape', frame: { x: x + w - h, y, w: h, h }, shape: { type: 'ellipse', fill } },
  ]
}

/* ── posters ────────────────────────────────────────────────────────────── */

const POSTER_NAMES: Record<PosterFamily, string> = {
  talk: 'جلسة',
  workshop: 'ورشة',
  panel: 'حوار',
  meetup: 'لقاء',
  announcement: 'إعلان',
}

/** One colourway per family (the header's table). Four fields, because that is
 *  every colour a poster paints: the ground, the type on it, and the pill's
 *  fill and its own type. */
interface Colourway {
  ground: string
  ink: string
  pillFill: string
  pillInk: string
}

/** ★ The ground is the only thing that differs between the five. Type is always
 *  `design.ink`, the pill is always ink filled with the ground colour as its
 *  own type — the artboard's rule on all four of its vivid cards, and the
 *  reason there is one helper rather than five literal rows that could drift
 *  apart. */
const vivid = (ground: string): Colourway => ({
  ground,
  ink: '{{design.ink}}',
  pillFill: '{{design.ink}}',
  pillInk: ground,
})

const COLOURWAYS: Record<PosterFamily, Colourway> = {
  // The colourway `AdminDesignerElements.dc.html` draws at full size and the
  // library draws first — the representative poster, for the commonest family.
  talk: vivid('{{design.tangerine}}'),
  workshop: vivid('{{design.lime}}'),
  panel: vivid('{{design.coral}}'),
  // ★ The artboard's own, by name: the platform card «لقاء».
  meetup: vivid('{{design.cyan}}'),
  // ★ The artboard's own, by name: the platform card «إعلان».
  announcement: vivid('{{design.violet}}'),
}

/**
 * ★ One poster structure, five colourways (`REQ-DSG-033`: «each family differs
 * by its colourway, not its structure»).
 *
 * The thumbnails' composition, read off their inline styles: a flat ground; the
 * category as a pill at the block-start; the title large in the display face at
 * 1.12, floating between; the presenter and the date bottom-start, small and
 * bold, two lines; the verification QR bottom-end. Nothing else.
 *
 * GEOMETRY IS MEASURED FROM THE SAFE BOX, never from the page: the master's
 * inset is 80 px and `derive()` maps the safe box to each preset's own, so a
 * layer 80 px below the master's top edge is a layer AT the top of the safe
 * area and lands at 120 on `story` rather than at 80 (`presets.ts`). The
 * thumbnails' own 9-of-196 padding is 4.6 %, tighter than the master's 7.4 %;
 * the safe inset wins, because what it protects is a print trim.
 *
 * ALL FOUR FORMATS THE LIBRARY CARD NAMES — 16:9 (`landscape`), A4, A3 and
 * 9:16 (`story`) — derive from this one master with no manual step, and so do
 * `square` and the `og` card. `block-end` holds the foot block to the foot by
 * its distance from the safe box's bottom; the QR is `fixed`, so it is the
 * same physical size on A3 as on 16:9 (a QR that shrinks with the page is a QR
 * that stops scanning); and text re-fits per preset, so A3's title is
 * genuinely larger rather than an upscaled raster.
 */
function posterDocument(family: PosterFamily): DesignDocument {
  const master = PRESETS.master
  const c = COLOURWAYS[family]

  const layers: Layer[] = [
    // Opposite the pill, out of the composition's way. The thumbnails draw no
    // logo; the owner kept it (ruling 2).
    logo({ x: 880, y: 80, w: 120, h: 120 }),
    ...pill(80, 80, 300, 72, c.pillFill),
    {
      id: 'l_category',
      kind: 'text',
      name: 'التصنيف',
      frame: { x: 80, y: 80, w: 300, h: 72 },
      // A literal, because the family IS the category here. The thumbnail
      // prints `{التصنيف}` and the session row has no category to bind: adding
      // `session.category` is a DAL read, a value in `poster_render_context()`
      // and one in the worker — new scope — and it would make all five poster
      // documents byte-identical, which `designer-library.test.ts`'s «eleven
      // DISTINCT documents» refuses and `DEC-148`'s reasoning refuses with it.
      text: { literal: POSTER_NAMES[family] },
      font: { family: DISPLAY, size: 40, lineHeight: 1.4, letterSpacing: 0, weight: 700 },
      color: c.pillInk,
      align: 'center',
      z: 10,
    },
    {
      id: 'l_title',
      kind: 'text',
      name: 'عنوان الجلسة',
      frame: { x: 80, y: 300, w: 920, h: 430 },
      text: { binding: 'session.title', fallback: 'عنوان الجلسة' },
      font: { family: DISPLAY, size: 96, minSize: 56, lineHeight: TITLE_LEADING, letterSpacing: 0, weight: 800 },
      color: c.ink,
      align: 'start',
      autoFit: { mode: 'shrink-then-wrap', maxLines: 3 },
      z: 10,
    },
    {
      id: 'l_presenters',
      kind: 'dynamic_field',
      name: 'المقدِّمون',
      frame: { x: 80, y: 1010, w: 640, h: 130 },
      field: { binding: 'session.presenters', fallback: 'اسم المقدِّم' },
      font: { family: DISPLAY, size: 44, minSize: 32, lineHeight: 1.4, letterSpacing: 0, weight: 700 },
      color: c.ink,
      align: 'start',
      autoFit: { mode: 'shrink-then-wrap', maxLines: 2 },
      presets: { default: { anchor: 'block-end', scale: 'proportional' } },
      z: 10,
    },
    {
      id: 'l_when',
      kind: 'dynamic_field',
      name: 'الموعد',
      frame: { x: 80, y: 1150, w: 640, h: 62 },
      field: { binding: 'session.startsAt', fallback: 'التاريخ والوقت' },
      font: { family: DISPLAY, size: 40, lineHeight: 1.4, letterSpacing: 0, weight: 700 },
      color: c.ink,
      align: 'start',
      presets: { default: { anchor: 'block-end', scale: 'proportional' } },
      z: 10,
    },
    {
      id: 'l_qr',
      kind: 'qr',
      name: 'رمز الجلسة',
      // Locked: a poster whose QR was dragged off the page leads nowhere, and
      // nobody notices until it is on a wall.
      locked: true,
      // Bottom-END, beside the presenter and the date rather than above them —
      // the thumbnails' own arrangement.
      frame: { x: 860, y: 1130, w: 140, h: 140 },
      qr: { binding: 'session.eventUrl', ecLevel: 'M', quietZoneModules: 4 },
      // ★★ `proportional`, and the comment that stood here from M6 until wave 24
      // was WRONG — it said `fixed` keeps «the same physical size on every
      // variant», which is the opposite of what `fixed` does across a change of
      // dpi.
      //
      // `fixed` holds the frame's PIXELS at the value authored on the master.
      // The poster master is 72 dpi and A4/A3 are 300 dpi, so 140 px is 49.4 mm
      // on every screen preset and 11.9 mm on both PRINT presets — a 4.2×
      // physical shrink on exactly the two variants that get printed and stuck
      // on a wall. Measured over all seven presets, not reasoned about.
      //
      // `proportional` scales the frame with the safe box, which across a dpi
      // change is what holds the physical size. Measured AFTER the change, on
      // every preset: A3 43.7, A4 30.4, master and story 49.4, square 38.1,
      // landscape 36.7, the `og` link card 20.1 — millimetres, all scannable.
      //
      // ★ The CERTIFICATE's QR keeps `fixed` and is right to: its master is
      // already 300 dpi and `presetsForDocument()` gives it exactly one preset,
      // so there is no dpi change to survive and 320 px is 27.1 mm wherever it
      // lands (`REQ-CRT-010`'s 25 mm minimum). The two settings differ because
      // the two masters differ, not because one of them is a mistake.
      presets: { default: { anchor: 'block-end', inlineAnchor: 'end', scale: 'proportional' } },
      z: 10,
    },
  ]

  return {
    schemaVersion: BASE_SCHEMA_VERSION,
    purpose: 'poster',
    master: { width: master.width, height: master.height, unit: 'px', dpi: master.dpi },
    direction: 'rtl',
    // ★ FLAT, not DEC-127's gradient — `REQ-DSG-026`'s gradient clause is one
    // of the four `DEC-242` supersedes, and the thumbnails draw a flat ground
    // on all seven cards. `model.ts`'s gradient union and `backgroundCss()`'s
    // `360 − angle` mirror are untouched and still proven by
    // `tests/unit/gradient-render.test.ts`.
    background: { type: 'solid', color: c.ground },
    layers,
  }
}

/* ── certificates ───────────────────────────────────────────────────────── */

const CERTIFICATE_NAMES: Record<CertificateFamily, string> = {
  attendance: 'شهادة حضور',
  presenter: 'شهادة تقديم',
  achievement: 'شهادة إنجاز',
}

const ORIENTATION_NAMES: Record<CertificateOrientation, string> = {
  landscape: 'أفقية',
  portrait: 'عمودية',
}

/** A certificate's geometry, per composition. Everything that differs between
 *  landscape and portrait is here; the layers themselves are one list.
 *
 *  ★ The inner margin is 240 px at 300 dpi — 20 mm — well inside the 5 mm
 *  print safe inset, and close to the thumbnails' own padding (12 of 140 is
 *  8.6 %, which is 214 px on a 2480-tall page). The safe inset is the floor,
 *  not the composition. */
interface CertificateLayout {
  preset: 'cert_landscape' | 'cert_portrait'
  /** The inner composition box. */
  box: { x: number; y: number; w: number; h: number }
  logo: Layer['frame']
  /** The block-start column the wordmark and the kind sit in. */
  head: number
  recipient: { y: number; h: number }
  reason: { y: number; h: number }
  issued: number
  signature: { x: number; y: number }
  identifiers: { w: number; serialY: number; codeY: number }
  qr: { x: number; y: number }
}

/** The space between the mark and the wordmark in the lockup — the artboard's
 *  `gap: 10px` of a 680-wide page, 1.47 %, which is 52 px at 3508. */
const LOCKUP_GAP = 52

/** The signature label's size, and one line of it. `Math.ceil` because the
 *  frame must be at least its own line tall — a shorter one warns on every
 *  export, and the fraction is where that creeps in. */
/** The wordmark's slot. A FIXED width, not a fraction of `L.head`: the text is a
 *  fixed literal at a fixed size and measures ~640 px at 120, so a fraction
 *  would be generous on landscape and too narrow on portrait, where `head` is
 *  1700. 700 fits both with room and keeps the org's name beside it rather than
 *  adrift. */
const WORDMARK_SLOT = 700

const SIGNATURE_SIZE = 56
const SIGNATURE_LINE = Math.ceil(SIGNATURE_SIZE * 1.7)

const LAYOUTS: Record<CertificateOrientation, CertificateLayout> = {
  landscape: {
    preset: 'cert_landscape',
    box: { x: 240, y: 240, w: 3028, h: 2000 },
    logo: { x: 240, y: 240, w: 220, h: 220 },
    head: 2200,
    recipient: { y: 640, h: 850 },
    reason: { y: 1540, h: 260 },
    issued: 1840,
    signature: { x: 1900, y: 2120 },
    identifiers: { w: 1400, serialY: 2020, codeY: 2130 },
    qr: { x: 2948, y: 1920 },
  },
  portrait: {
    preset: 'cert_portrait',
    box: { x: 240, y: 240, w: 2000, h: 3028 },
    logo: { x: 240, y: 240, w: 220, h: 220 },
    head: 1700,
    recipient: { y: 700, h: 1000 },
    reason: { y: 1780, h: 260 },
    issued: 2100,
    signature: { x: 1440, y: 2900 },
    identifiers: { w: 1300, serialY: 2980, codeY: 3090 },
    qr: { x: 1920, y: 2948 },
  },
}

/**
 * ★ The certificate, rebuilt to the thumbnails (`REQ-CRT-016`): a bone ground,
 * ink text, the org wordmark at the top-start in the display face at a small
 * size, the member's name LARGE in the display face, the serial at the
 * bottom-start in `fgMuted`, the verification QR at the bottom-end.
 *
 * ★ A corner composition, not a centred one. Every line was centred before
 * this wave; the thumbnails hang the whole page off the block-start inline-start
 * corner and put the locked block across the foot.
 *
 * ★ THE SIZE THE THUMBNAIL ASKS FOR IS MEASURED, not guessed. The card is
 * 196 × 140 for a 3508 × 2480 page, so its scale is 0.056 by width and 0.0565
 * by height — and its 18 px QR square is 320 px on the page, which is exactly
 * the 25 mm `REQ-CRT-010` requires and exactly what this library already drew.
 * That agreement is what makes the rest of its type scale trustworthy: an
 * 18 px name is ~320 px and an 11 px wordmark is ~196 px. The member's name
 * dominates the page, which is the one thing a certificate is about.
 *
 * ★ FOUR LAYERS THE THUMBNAIL DOES NOT DRAW ARE KEPT (wave 24 ruling 2 — «a
 * 196 px preview is not an inventory»): the org logo, the kind line, the
 * reason and the issue date. Each has a reason the preview cannot carry — the
 * logo keeps `06` §8.3 and `REQ-DSG-019` a subject; the kind is the only thing
 * that says what is being certified, and without it `attendance@landscape` and
 * `presenter@landscape` would be BYTE-IDENTICAL documents; the reason is how
 * an achievement names the achievement; and a certificate that does not say
 * when it was issued is a regression. ★ The verification CODE is kept because
 * `REQ-CRT-010` and A29 require the serial AND the code printed as text beside
 * the QR — a QR that will not scan needs a fallback a human can type.
 */
function certificateDocument(family: CertificateFamily, orientation: CertificateOrientation): DesignDocument {
  const L = LAYOUTS[orientation]
  const master = PRESETS[L.preset]
  const { x, w } = L.box

  const layers: Layer[] = [
    // ★ INSIDE THE LOCKUP at the block-start inline-start, not opposite it
    //   (wave 24's re-colour). `AdminCertDesigner.dc.html` draws a 40 × 40 mark
    //   and the wordmark 10 px apart as ONE lockup — `display: flex; gap: 10px`
    //   at `top: 40; inset-inline-start: 48` — and `DEC-242` §1, which named
    //   only «the org wordmark top-start», had the logo on the other side of
    //   the page. The mark's 40 of 680 is 5.9 % of the width, which is 206 px
    //   on a 3508 page: 220 was already right, only its corner was wrong.
    logo(L.logo),
    {
      id: 'l_wordmark',
      kind: 'text',
      name: 'اسم المنصة',
      // ★ THE LOCKUP IS THREE PARTS, from the rendered artboard
      //   (`png/SCR-056 · 057 · المصمّم — قالب شهادة@1x.png`): a mark, the
      //   PLATFORM's name in the display face, and the ORG's name after it,
      //   small and muted. `DEC-242` §1 named «the org wordmark» alone and had
      //   the logo on the other side of the page; the render has all three
      //   together at the block-start inline-start.
      //
      // ★ A LITERAL, and deliberately so: «كريم معرفة» is the product, and an
      //   org is a chapter of it — the email artboards put the same pair in the
      //   same order in every message header. It needs no binding, which is what
      //   keeps this refinement inside the wave.
      //
      // Optically centred on the mark: the mark spans 220 from `L.logo.y`, so a
      // 170-high line sits 25 below its top.
      frame: { x: x + L.logo.w + LOCKUP_GAP, y: L.box.y + 25, w: WORDMARK_SLOT, h: 170 },
      text: { literal: 'كريم معرفة' },
      font: { family: DISPLAY, size: 120, lineHeight: 1.4, letterSpacing: 0, weight: 700 },
      color: '{{brand.fgHeading}}',
      align: 'start',
      z: 10,
    },
    {
      id: 'l_org',
      kind: 'dynamic_field',
      name: 'اسم المؤسسة',
      // After the wordmark on the same line, at the render's own ratio — the
      // org's name is ~0.55 of the platform's there — and dropped 62 so the two
      // sit on one optical baseline rather than one top edge.
      frame: {
        x: x + L.logo.w + LOCKUP_GAP + WORDMARK_SLOT + LOCKUP_GAP,
        y: L.box.y + 25 + 62,
        w: L.head - L.logo.w - LOCKUP_GAP * 2 - WORDMARK_SLOT,
        h: 90,
      },
      field: { binding: 'org.name', fallback: 'اسم المؤسسة' },
      font: { family: DISPLAY, size: 64, lineHeight: 1.4, letterSpacing: 0, weight: 700 },
      color: '{{brand.fgMuted}}',
      align: 'start',
      z: 10,
    },
    {
      id: 'l_kind',
      kind: 'text',
      name: 'نوع الشهادة',
      // ★ BELOW THE LOCKUP, not beside it. `L.box.y + 190` put this at 430 while
      //   the mark now spans 240 – 460 in the same column, and the two collided
      //   by 30 px — found by rendering the certificate at its own size, which no
      //   assertion would have caught: both frames are inside the safe box and
      //   neither is shorter than its own line.
      frame: { x, y: L.logo.y + L.logo.h + 40, w: L.head, h: 120 },
      text: { literal: CERTIFICATE_NAMES[family] },
      font: { family: DISPLAY, size: 84, lineHeight: 1.4, letterSpacing: 0, weight: 700 },
      color: '{{brand.fgMuted}}',
      align: 'start',
      z: 10,
    },
    {
      id: 'l_recipient',
      kind: 'dynamic_field',
      name: 'اسم المستفيد',
      frame: { x, y: L.recipient.y, w, h: L.recipient.h },
      // The FROZEN snapshot, never the live profile: a certificate records
      // what was printed (REQ-CRT-014).
      field: { binding: 'recipient.name', fallback: 'اسم المستفيد' },
      font: { family: DISPLAY, size: 300, minSize: 150, lineHeight: TITLE_LEADING, letterSpacing: 0, weight: 800 },
      color: '{{brand.fgHeading}}',
      align: 'start',
      autoFit: { mode: 'shrink-then-wrap', maxLines: 2 },
      z: 10,
    },
    {
      id: 'l_reason',
      kind: 'dynamic_field',
      name: 'عن الجلسة',
      frame: { x, y: L.reason.y, w, h: L.reason.h },
      field: {
        binding: family === 'achievement' ? 'certificate.achievementName' : 'session.title',
        fallback: family === 'achievement' ? 'اسم الإنجاز' : 'عنوان الجلسة',
      },
      font: { family: BODY, size: 72, minSize: 48, lineHeight: 1.7, weight: 400 },
      color: '{{brand.fgBody}}',
      align: 'start',
      autoFit: { mode: 'shrink-then-wrap', maxLines: 2 },
      z: 10,
    },
    {
      id: 'l_issued',
      kind: 'dynamic_field',
      name: 'تاريخ الإصدار',
      frame: { x, y: L.issued, w: L.identifiers.w, h: 100 },
      field: { binding: 'certificate.issuedAt', fallback: 'تاريخ الإصدار' },
      font: { family: BODY, size: 56, lineHeight: 1.7, weight: 400 },
      color: '{{brand.fgMuted}}',
      align: 'start',
      z: 10,
    },
    // ── the locked block (REQ-DSG-024, REQ-CRT-010) ───────────────────────
    {
      id: 'l_qr',
      kind: 'qr',
      name: 'رمز التحقّق',
      locked: true,
      // 25 mm at 300 dpi is 295 px and REQ-CRT-010's minimum is 25 mm; the
      // thumbnail's own 18 px square is 320 px on the page, which agrees.
      frame: { x: L.qr.x, y: L.qr.y, w: 320, h: 320 },
      qr: { binding: 'certificate.verifyUrl', ecLevel: 'Q', quietZoneModules: 4 },
      // `fixed` — correct HERE, and for a reason the poster's QR does not share:
      // this document's master is already 300 dpi and it derives to exactly one
      // preset (its own), so `fixed` holds 320 px = 27.1 mm and there is no dpi
      // change to shrink it. See the poster's QR for what `fixed` costs when the
      // master and the target disagree about dpi.
      presets: { default: { anchor: 'block-end', scale: 'fixed' } },
      z: 20,
    },
    {
      id: 'l_serial',
      kind: 'dynamic_field',
      name: 'الرقم التسلسلي',
      locked: true,
      frame: { x, y: L.identifiers.serialY, w: L.identifiers.w, h: 100 },
      field: { binding: 'certificate.serial', fallback: 'الرقم التسلسلي' },
      font: { family: BODY, size: 56, lineHeight: 1.7, weight: 400 },
      color: '{{brand.fgMuted}}',
      align: 'start',
      presets: { default: { anchor: 'block-end', scale: 'fixed' } },
      z: 20,
    },
    {
      id: 'l_code',
      kind: 'dynamic_field',
      name: 'رمز التحقّق النصّي',
      locked: true,
      // Printed beside the QR because a QR that will not scan needs a
      // fallback a human can type (A29, REQ-CRT-010).
      frame: { x, y: L.identifiers.codeY, w: L.identifiers.w, h: 100 },
      field: { binding: 'certificate.verificationCode', fallback: 'رمز التحقّق' },
      font: { family: BODY, size: 56, lineHeight: 1.7, weight: 400 },
      color: '{{brand.fgMuted}}',
      align: 'start',
      presets: { default: { anchor: 'block-end', scale: 'fixed' } },
      z: 20,
    },
    {
      id: 'l_signature',
      kind: 'shape',
      name: 'موضع التوقيع',
      locked: true,
      frame: { x: L.signature.x, y: L.signature.y, w: 800, h: 2 },
      // `edge`, not `edgeStrong`: `DEC-242` §2 made `edgeStrong` the
      // secondary-TEXT value, which is far too heavy for a hairline.
      shape: { type: 'rect', fill: '{{brand.edge}}' },
      presets: { default: { anchor: 'block-end', scale: 'fixed' } },
      z: 20,
    },
    {
      id: 'l_signature_label',
      kind: 'text',
      name: 'تسمية التوقيع',
      // ★ The rule gains its label (wave 24's re-colour). The artboard draws
      //   the signature as `border-top` + `padding-top: 6px` + `{التوقيع}`, so
      //   the word sits UNDER the line; a rule with nothing under it is a line
      //   on a page, and nobody signing knows it is for them.
      //
      // ★ A LITERAL, not a binding, and that is the whole reason this one is in
      //   scope while the artboard's body sentence is not: «التوقيع» is a
      //   printed LABEL — the Arabic word for «signature» — not data. There is
      //   no `certificate.signatory` binding and this does not invent one; the
      //   five that exist are `serial`, `issuedAt`, `verificationCode`,
      //   `verifyUrl` and `achievementName`.
      //
      // ★ GEOMETRY MEASURED AGAINST THE TWO THINGS THAT CAN BITE, both of which
      //   an existing assertion caught rather than a reading of the artboard:
      //
      //   · ONE LINE TALL AT ITS OWN SIZE. A 56 px line at 1.7 needs 96 px, and
      //     a frame shorter than its own line is «the frame that made every
      //     export warn» (`designer-library.test.ts`). So the height is the line,
      //     and the label is pushed UP where sitting 31 below the rule would take
      //     it past the safe box — which is the landscape case exactly.
      //   · NEVER UNDER THE QR. The rule is 800 wide on both orientations, but on
      //     portrait the QR starts only 480 inside it, so the LABEL is clipped to
      //     stop clear of it. The rule itself passes above the QR and always did.
      frame: {
        x: L.signature.x,
        y: Math.min(L.signature.y + 31, L.box.y + L.box.h - SIGNATURE_LINE),
        w: Math.min(800, L.qr.x - L.signature.x - 40),
        h: SIGNATURE_LINE,
      },
      text: { literal: 'التوقيع' },
      font: { family: BODY, size: SIGNATURE_SIZE, lineHeight: 1.7, letterSpacing: 0, weight: 400 },
      color: '{{brand.fgMuted}}',
      align: 'start',
      presets: { default: { anchor: 'block-end', scale: 'fixed' } },
      z: 20,
    },
  ]

  return {
    schemaVersion: BASE_SCHEMA_VERSION,
    purpose: 'certificate',
    master: { width: master.width, height: master.height, unit: 'px', dpi: master.dpi },
    direction: 'rtl',
    // The thumbnails' bone ground. Under the light scheme this is the design's
    // paper (`#f6f3ec`); under the dark one it is ink, and the type flips with
    // it — which is what «both schemes, 22 variants» means.
    background: { type: 'solid', color: '{{brand.canvas}}' },
    layers,
  }
}

/** 06 §3.3's library as DEC-148 rules it and DEC-242 rebuilds it: eleven
 *  compositions, all at version 1 — eleven NEW rows, the superseded eleven
 *  deleted or retired by `supersede_baseline_template()`. */
export const BASELINE_LIBRARY: BaselineTemplate[] = [
  ...(['talk', 'workshop', 'panel', 'meetup', 'announcement'] as const).map((family) => ({
    family,
    purpose: 'poster' as const,
    name: POSTER_NAMES[family],
    version: 2,
    isDefault: true,
    document: posterDocument(family),
  })),
  ...(['attendance', 'presenter', 'achievement'] as const).flatMap((family) =>
    (['landscape', 'portrait'] as const).map((orientation) => ({
      family,
      purpose: 'certificate' as const,
      orientation,
      name: `${CERTIFICATE_NAMES[family]} ${ORIENTATION_NAMES[orientation]}`,
      version: 2,
      isDefault: orientation === 'landscape',
      document: certificateDocument(family, orientation),
    })),
  ),
]

/**
 * The brand rules, as a check anything can run — REQ-DSG-026, DEC-003.
 *
 * ★ AFTER WAVE 24's RE-COLOUR THIS IS THE PLATFORM'S OWN STANDARD, not a
 * constraint on anybody. The database guard no longer refuses a literal colour
 * — a brand token is an option an admin may take, not a toll every colour pays
 * (the owner's ruling) — so nothing here is enforced on an org's document, and
 * nothing outside `BASELINE_LIBRARY`'s own test calls it. What it still buys is
 * that the ELEVEN BASELINE COMPOSITIONS bind named colours rather than hexes:
 * one definition, one edit, one place, which is `REQ-DSG-021`'s substance
 * surviving the removal of its mandate.
 *
 * A style guide nobody opens while designing is a style guide that is not
 * followed. This is the same rules as a function, so the library's own test
 * and any future template screen can ask the same question.
 */
export function brandViolations(document: DesignDocument): string[] {
  const problems: string[] = []
  const text = JSON.stringify(document)

  // No literal colour anywhere: the database refuses one in a template
  // version too, and this says so before it gets there (REQ-DSG-021).
  for (const hex of text.match(/"#[0-9a-fA-F]{3,8}"/g) ?? []) problems.push(`a hard-coded colour ${hex}`)

  // ★ And every colour a template carries is a TOKEN THAT EXISTS, in one of the
  // two namespaces — `rgb(…)`, `navy` and `{{brand.canvsRaise}}` are as
  // hard-coded, or as broken, as a hex. Every stop of a gradient included
  // (DEC-127): a gradient has no `background.color`, which is exactly where the
  // first guard stopped looking. ★ The database no longer checks any of this
  // (wave 24's re-colour), so this is the only place it is checked, and it is
  // checked only against the platform's own library.
  for (const { path, value } of colourFieldsOf(document)) {
    const bound = /^\{\{\s*(brand|design)\.([A-Za-z]+)\s*\}\}$/.exec(value)
    if (!bound) {
      if (!/^#[0-9a-fA-F]{3,8}$/.test(value)) problems.push(`a hard-coded colour ${path} = ${value}`)
    } else {
      const ns = bound[1] ?? ''
      const token = bound[2] ?? ''
      const vocabulary: readonly string[] = ns === 'brand' ? BRAND_COLOUR_TOKENS : DESIGN_COLOUR_NAMES
      if (!vocabulary.includes(token)) problems.push(`an unknown ${ns} colour ${path} = ${value}`)
    }
  }

  // No emoji. The permitted glyphs are dots, lines, chevron, check and
  // spinner, all of them drawn as shapes.
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(text)) problems.push('an emoji')

  for (const layer of document.layers) {
    // The only image in the library is the org logo, and it BINDS rather
    // than embedding — no photography, no icon library, no illustration.
    if (layer.kind === 'image') {
      if (layer.image.binding !== 'brand.logoAssetId') {
        problems.push(`the image layer ${layer.id} is not the bound org logo`)
      }
      if (layer.image.assetId) problems.push(`the image layer ${layer.id} embeds an asset instead of binding one`)
    }
    // Logical alignment only, so the LTR mirror is a direction flip rather
    // than a second drawing (06 §2.2).
    if ('align' in layer && layer.align !== undefined && !['start', 'center', 'end'].includes(layer.align)) {
      problems.push(`the layer ${layer.id} uses physical alignment`)
    }
    // A30: letter-spacing is always zero on Arabic.
    if ('font' in layer && layer.font.letterSpacing !== undefined && layer.font.letterSpacing !== 0) {
      problems.push(`the layer ${layer.id} letter-spaces Arabic`)
    }
  }

  return problems
}

/**
 * Every colour a document carries, with where it is — REQ-DSG-021, DEC-127.
 *
 * THE list of colour-bearing fields: the background's colour or every stop
 * of its gradient, and each layer's `color`, `shape.fill` and
 * `shape.stroke`. `brandViolations()` judges them, and the database's
 * template guard walks the same fields (`tests/unit/designer-library.test.ts`
 * holds the SQL to this list), so a colour field added to the model and to
 * neither is a failing test rather than a template nobody can rebrand.
 */
export function colourFieldsOf(document: DesignDocument): Array<{ path: string; value: string }> {
  const out: Array<{ path: string; value: string }> = []
  const add = (path: string, value: unknown) => {
    if (typeof value === 'string') out.push({ path, value })
  }
  const bg = document.background
  if (bg?.type === 'solid') add('background.color', bg.color)
  if (bg?.type === 'gradient') (bg.stops ?? []).forEach((stop, i) => add(`background.stops[${i}].color`, stop?.color))
  document.layers.forEach((layer, i) => {
    if ('color' in layer) add(`layers[${i}].color`, layer.color)
    if (layer.kind === 'shape') {
      add(`layers[${i}].shape.fill`, layer.shape.fill)
      add(`layers[${i}].shape.stroke`, layer.shape.stroke)
    }
  })
  return out
}
