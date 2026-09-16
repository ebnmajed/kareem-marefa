/**
 * The baseline template library — REQ-DSG-026, A27, DEC-003, 06 §3.3,
 * DEC-125, DEC-127, DEC-128, DEC-148.
 *
 * THE BRAND CONSTRAINT, which is the reason this file is data rather than
 * pictures: no open books, no graduation caps, no lightbulbs, no traditional
 * education iconography, no cartoon illustration — and by project policy no
 * icon libraries, no emoji, no photography. The permitted glyphs are dots,
 * lines, chevron, check and spinner. The visual language is the KNOWLEDGE
 * NETWORK: connected dots, thin silver lines, light.
 *
 * Every family here is built from `text`, `shape` and `qr` layers only. There
 * is no image layer except the org logo, which binds to `brand.logoAssetId`
 * rather than embedding anything — which is what makes replacing a logo
 * update every template at once (06 §8.3).
 *
 * ★ A ROW IS A COMPOSITION (DEC-148, contract 3). Eleven platform templates:
 * the five poster families, and the three certificate families each in a
 * LANDSCAPE and a PORTRAIT composition. The two differences between variants
 * are different in kind, and that is the whole ruling:
 *
 *   · SCHEME is a palette. Every colour is a `{{brand.*}}` token, so a light
 *     and a dark row of one family would carry byte-identical documents —
 *     the scheme is chosen where a render is decided (a poster is always
 *     `dark`, DEC-125; a certificate pins the scheme chosen for its session)
 *     and is never a row.
 *   · ORIENTATION is a composition. A portrait certificate cannot be derived
 *     from a landscape one: `derive()` put every line of the old landscape
 *     document into the top 29% of a portrait page with a 157 mm empty band
 *     under it (measured). So each is its own document, and the document's
 *     own master says which it is — no column needed (REQ-DSG-005).
 *
 * VERSIONS, NEVER EDITS (REQ-DSG-007, REQ-CRT-014). This file is the LATEST
 * version of each composition; `0061` seeded version 1 of the eight it had,
 * and the wave-8 seed adds version 2 of those and version 1 of the three
 * portraits. An artifact references a version, so a certificate issued
 * against version 1 renders as version 1 forever.
 *
 * The LTR mirror A27 reserves for English is not a second document: every
 * alignment here is logical, every inset is `inset-inline`, and a gradient's
 * angle is the RTL source's — the renderer mirrors it (DEC-127).
 */

import { declaredBindingsOf } from './bindings.js'
import { BRAND_COLOUR_TOKENS } from './brand.js'
import type { DesignDocument, Layer } from './model.js'
import { SCHEMA_VERSION } from './model.js'
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
  return declaredBindingsOf(document).filter((b) => !b.startsWith('brand.') || b === 'brand.logoAssetId')
}

/* ── the shared vocabulary ──────────────────────────────────────────────── */

const KUFI = 'Reem Kufi' // the display face for posters (06 §7.1)
const NASKH = 'Amiri' // the formal face for certificates
const BODY = 'IBM Plex Sans Arabic'

/** The Knowledge Network, as geometry: a thin rule with three nodes on it.
 *  Dots and lines, which is the whole permitted vocabulary. */
function networkRule(id: string, x: number, y: number, width: number, fill: string): Layer[] {
  const dot = (n: number, at: number): Layer => ({
    id: `${id}-node-${n}`,
    kind: 'shape',
    name: 'عقدة الشبكة',
    frame: { x: at - 5, y: y - 4, w: 10, h: 10 },
    shape: { type: 'ellipse', fill: '{{brand.node}}' },
    z: 3,
  })
  return [
    {
      id,
      kind: 'shape',
      name: 'خط الشبكة',
      frame: { x, y, w: width, h: 2 },
      shape: { type: 'rect', fill },
      z: 2,
    },
    dot(1, x + 40),
    dot(2, x + Math.round(width / 2)),
    dot(3, x + width - 40),
  ]
}

const logo = (frame: Layer['frame']): Layer => ({
  id: 'l_logo',
  kind: 'image',
  name: 'شعار المؤسسة',
  // Bound, never embedded: replacing the logo updates every template at once.
  image: { binding: 'brand.logoAssetId', fit: 'contain' },
  frame,
  presets: { default: { anchor: 'block-start', scale: 'proportional' } },
  z: 10,
})

/* ── posters ────────────────────────────────────────────────────────────── */

const POSTER_NAMES: Record<PosterFamily, string> = {
  talk: 'جلسة',
  workshop: 'ورشة',
  panel: 'حوار',
  meetup: 'لقاء',
  announcement: 'إعلان',
}

/**
 * Version 2 of every poster family (wave 8):
 *
 *   · the background is DEC-127's gradient, `140deg` from `{{brand.surface}}`
 *     to `{{brand.canvasRaise}}` — the canvas's own card medium, in tokens;
 *   · the Knowledge Network rule binds `{{brand.edgeStrong}}`. On the dark
 *     gradient `{{brand.spine}}` measured 1.27:1 on `surface` and 1.05:1 on
 *     `canvasRaise` — the motif vanished at the lit end. Posters only, and
 *     reversible by a version 3 (DEC-148, q4);
 *   · the date and venue lines are 70 px tall: at 40 px and a 1.7 line height
 *     a line is 68 px, and a 60 px frame reported «reached its minimum size»
 *     on every preset of every session (found on the 390 px review);
 *   · the rule and its nodes are named, so the layer list does not show ids.
 */
function posterDocument(family: PosterFamily): DesignDocument {
  const master = PRESETS.master
  const layers: Layer[] = [
    logo({ x: 80, y: 80, w: 160, h: 160 }),
    {
      id: 'l_kicker',
      kind: 'text',
      name: 'نوع الجلسة',
      frame: { x: 80, y: 280, w: 920, h: 60 },
      // A literal, because the family IS the kicker. Not a binding: there is
      // nothing in the session row that says "ورشة".
      text: { literal: POSTER_NAMES[family] },
      font: { family: BODY, size: 40, lineHeight: 1.4, weight: 500 },
      color: '{{brand.fgMuted}}',
      align: 'start',
      z: 10,
    },
    {
      id: 'l_title',
      kind: 'text',
      name: 'عنوان الجلسة',
      frame: { x: 80, y: 360, w: 920, h: 330 },
      text: { binding: 'session.title', fallback: 'عنوان الجلسة' },
      font: { family: KUFI, size: 96, minSize: 56, lineHeight: 1.4, letterSpacing: 0, weight: 600 },
      color: '{{brand.fgHeading}}',
      align: 'start',
      autoFit: { mode: 'shrink-then-wrap', maxLines: 3 },
      z: 10,
    },
    ...networkRule('l_rule', 80, 720, 920, '{{brand.edgeStrong}}'),
    {
      id: 'l_presenters',
      kind: 'dynamic_field',
      name: 'المقدِّمون',
      frame: { x: 80, y: 770, w: 920, h: 80 },
      field: { binding: 'session.presenters', fallback: 'اسم المقدِّم' },
      font: { family: BODY, size: 44, minSize: 32, lineHeight: 1.7, weight: 500 },
      color: '{{brand.fgBody}}',
      align: 'start',
      autoFit: { mode: 'shrink-then-wrap', maxLines: 2 },
      z: 10,
    },
    {
      id: 'l_when',
      kind: 'dynamic_field',
      name: 'الموعد',
      frame: { x: 80, y: 870, w: 920, h: 70 },
      field: { binding: 'session.startsAt', fallback: 'التاريخ والوقت' },
      font: { family: BODY, size: 40, lineHeight: 1.7 },
      color: '{{brand.fgBody}}',
      align: 'start',
      z: 10,
    },
    {
      id: 'l_where',
      kind: 'dynamic_field',
      name: 'المكان',
      frame: { x: 80, y: 945, w: 760, h: 70 },
      field: { binding: 'session.venueName', fallback: 'المكان' },
      font: { family: BODY, size: 40, lineHeight: 1.7 },
      color: '{{brand.fgMuted}}',
      align: 'start',
      // An og card is 1200×630 and a venue line is the first thing that does
      // not survive that crop. Declared, not discovered (06 §5.1).
      hideAt: ['og'],
      z: 10,
    },
    {
      id: 'l_qr',
      kind: 'qr',
      name: 'رمز الجلسة',
      // Locked: a poster whose QR was dragged off the page is a poster that
      // leads nowhere, and nobody notices until it is on a wall.
      locked: true,
      frame: { x: 80, y: 1130, w: 140, h: 140 },
      qr: { binding: 'session.eventUrl', ecLevel: 'M', quietZoneModules: 4 },
      // `fixed`, so the QR is the same physical size on every variant rather
      // than shrinking with the page until it will not scan.
      presets: { default: { anchor: 'block-end', scale: 'fixed' } },
      z: 10,
    },
  ]

  if (family === 'workshop') {
    // A27: the workshop family carries a preparatory-tasks strip.
    layers.push({
      id: 'l_tasks',
      kind: 'text',
      name: 'المهام التحضيرية',
      frame: { x: 260, y: 1130, w: 740, h: 140 },
      text: { literal: 'لهذه الورشة مهام تحضيرية — راجعها قبل الحضور.' },
      font: { family: BODY, size: 34, minSize: 26, lineHeight: 1.7 },
      color: '{{brand.fgMuted}}',
      align: 'start',
      autoFit: { mode: 'shrink-then-wrap', maxLines: 3 },
      // It is the first thing to go on the two smallest crops.
      hideAt: ['og', 'square'],
      presets: { default: { anchor: 'block-end', scale: 'proportional' } },
      z: 10,
    })
  }

  if (family === 'panel') {
    // A panel is many voices, so the presenters line gets the room the
    // single-presenter families give the venue.
    const presenters = layers.find((l) => l.id === 'l_presenters')
    if (presenters) presenters.frame = { ...presenters.frame, h: 160 }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    purpose: 'poster',
    master: { width: master.width, height: master.height, unit: 'px', dpi: master.dpi },
    direction: 'rtl',
    // DEC-127, exactly — the angle is the RTL source's, never a mirrored one.
    background: { type: 'gradient', angle: 140, stops: [{ color: '{{brand.surface}}' }, { color: '{{brand.canvasRaise}}' }] },
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
 *  landscape and portrait is here; the layers themselves are one list. */
interface CertificateLayout {
  preset: 'cert_landscape' | 'cert_portrait'
  column: { x: number; w: number }
  logo: Layer['frame']
  org: number
  kind: number
  rule: number
  recipient: { y: number; h: number }
  reason: { y: number; h: number }
  issued: number
  qr: { x: number; y: number }
  identifiers: { x: number; w: number; serialY: number; codeY: number }
  signature: { x: number; y: number }
}

const LAYOUTS: Record<CertificateOrientation, CertificateLayout> = {
  // Version 2 of the landscape compositions: the same page as version 1, with
  // every line frame at least one line tall at its own size — the type
  // name, the name, the date and the two locked identifiers were each a few
  // pixels short and reported «reached its minimum size» on every issue.
  landscape: {
    preset: 'cert_landscape',
    column: { x: 300, w: 2908 },
    logo: { x: 1644, y: 240, w: 220, h: 220 },
    org: 500,
    kind: 620,
    rule: 830,
    recipient: { y: 920, h: 220 },
    reason: { y: 1180, h: 220 },
    issued: 1420,
    qr: { x: 300, y: 1860 },
    identifiers: { x: 660, w: 900, serialY: 1880, codeY: 1965 },
    signature: { x: 2608, y: 2000 },
  },
  // Version 1 of the portrait compositions: a column down the page, the name
  // given two lines of room, and the locked block across the foot — balanced
  // so the text block and the locked block hold the page between them rather
  // than leaving a band under either (looked at, light and dark).
  portrait: {
    preset: 'cert_portrait',
    column: { x: 240, w: 2000 },
    logo: { x: 1130, y: 420, w: 220, h: 220 },
    org: 700,
    kind: 820,
    rule: 1060,
    recipient: { y: 1150, h: 440 },
    reason: { y: 1640, h: 230 },
    issued: 1920,
    qr: { x: 240, y: 2800 },
    identifiers: { x: 600, w: 1000, serialY: 2820, codeY: 2905 },
    signature: { x: 1640, y: 3080 },
  },
}

function certificateDocument(family: CertificateFamily, orientation: CertificateOrientation): DesignDocument {
  const L = LAYOUTS[orientation]
  const master = PRESETS[L.preset]
  const { x, w } = L.column

  const layers: Layer[] = [
    logo(L.logo),
    {
      id: 'l_org',
      kind: 'dynamic_field',
      name: 'اسم المؤسسة',
      frame: { x, y: L.org, w, h: 80 },
      field: { binding: 'org.name', fallback: 'اسم المؤسسة' },
      font: { family: BODY, size: 56, lineHeight: 1.4, weight: 500 },
      color: '{{brand.fgMuted}}',
      align: 'center',
      z: 10,
    },
    {
      id: 'l_kind',
      kind: 'text',
      name: 'نوع الشهادة',
      frame: { x, y: L.kind, w, h: 180 },
      text: { literal: CERTIFICATE_NAMES[family] },
      font: { family: NASKH, size: 128, minSize: 88, lineHeight: 1.4, letterSpacing: 0, weight: 600 },
      color: '{{brand.fgHeading}}',
      align: 'center',
      z: 10,
    },
    // Certificates keep `{{brand.spine}}`: they are chosen light or dark per
    // session, and q4's rebinding was ruled for the dark posters only.
    ...networkRule('l_rule', x, L.rule, w, '{{brand.spine}}'),
    {
      id: 'l_recipient',
      kind: 'dynamic_field',
      name: 'اسم المستفيد',
      frame: { x, y: L.recipient.y, w, h: L.recipient.h },
      // The FROZEN snapshot, never the live profile: a certificate records
      // what was printed (REQ-CRT-014).
      field: { binding: 'recipient.name', fallback: 'اسم المستفيد' },
      font: { family: NASKH, size: 150, minSize: 90, lineHeight: 1.4, letterSpacing: 0, weight: 600 },
      color: '{{brand.fgHeading}}',
      align: 'center',
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
      font: { family: BODY, size: 64, minSize: 44, lineHeight: 1.7 },
      color: '{{brand.fgBody}}',
      align: 'center',
      autoFit: { mode: 'shrink-then-wrap', maxLines: 2 },
      z: 10,
    },
    {
      id: 'l_issued',
      kind: 'dynamic_field',
      name: 'تاريخ الإصدار',
      frame: { x, y: L.issued, w, h: 82 },
      field: { binding: 'certificate.issuedAt', fallback: 'تاريخ الإصدار' },
      font: { family: BODY, size: 48, lineHeight: 1.7 },
      color: '{{brand.fgMuted}}',
      align: 'center',
      z: 10,
    },
    // ── the locked block (REQ-DSG-024, REQ-CRT-010) ───────────────────────
    {
      id: 'l_qr',
      kind: 'qr',
      name: 'رمز التحقّق',
      locked: true,
      // 25 mm at 300 dpi is 295 px, and REQ-CRT-010's minimum is 25 mm.
      frame: { x: L.qr.x, y: L.qr.y, w: 320, h: 320 },
      qr: { binding: 'certificate.verifyUrl', ecLevel: 'Q', quietZoneModules: 4 },
      // `fixed`: a QR that shrinks with the page is a QR that stops scanning.
      presets: { default: { anchor: 'block-end', scale: 'fixed' } },
      z: 20,
    },
    {
      id: 'l_serial',
      kind: 'dynamic_field',
      name: 'الرقم التسلسلي',
      locked: true,
      frame: { x: L.identifiers.x, y: L.identifiers.serialY, w: L.identifiers.w, h: 75 },
      field: { binding: 'certificate.serial', fallback: 'الرقم التسلسلي' },
      font: { family: BODY, size: 44, lineHeight: 1.7 },
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
      frame: { x: L.identifiers.x, y: L.identifiers.codeY, w: L.identifiers.w, h: 75 },
      field: { binding: 'certificate.verificationCode', fallback: 'رمز التحقّق' },
      font: { family: BODY, size: 44, lineHeight: 1.7 },
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
      frame: { x: L.signature.x, y: L.signature.y, w: 600, h: 2 },
      shape: { type: 'rect', fill: '{{brand.edgeStrong}}' },
      presets: { default: { anchor: 'block-end', scale: 'fixed' } },
      z: 20,
    },
  ]

  return {
    schemaVersion: SCHEMA_VERSION,
    purpose: 'certificate',
    master: { width: master.width, height: master.height, unit: 'px', dpi: master.dpi },
    direction: 'rtl',
    // Solid on purpose: DEC-127's gradient is the poster's. A dark
    // certificate is a flat `{{brand.canvas}}` page.
    background: { type: 'solid', color: '{{brand.canvas}}' },
    layers,
  }
}

/** 06 §3.3's library as DEC-148 rules it: eleven compositions. */
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
      version: orientation === 'landscape' ? 2 : 1,
      isDefault: orientation === 'landscape',
      document: certificateDocument(family, orientation),
    })),
  ),
]

/**
 * The brand rules, as a check anything can run — REQ-DSG-026, DEC-003.
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

  // ★ And every colour a template carries is a brand TOKEN THAT EXISTS —
  // `rgb(…)`, `navy` and `{{brand.canvsRaise}}` are as hard-coded, or as
  // broken, as a hex. Every stop of a gradient included (DEC-127): a
  // gradient has no `background.color`, which is exactly where the first
  // guard stopped looking. The database guard checks the binding SHAPE on the
  // same fields; membership lives here, beside the token list, so there is
  // one copy of it.
  for (const { path, value } of colourFieldsOf(document)) {
    const token = /^\{\{\s*brand\.([A-Za-z]+)\s*\}\}$/.exec(value)?.[1]
    if (!token) {
      if (!/^#[0-9a-fA-F]{3,8}$/.test(value)) problems.push(`a hard-coded colour ${path} = ${value}`)
    } else if (!(BRAND_COLOUR_TOKENS as readonly string[]).includes(token)) {
      problems.push(`an unknown brand colour ${path} = ${value}`)
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
