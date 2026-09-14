/**
 * The baseline template library — REQ-DSG-026, A27, DEC-003, 06 §3.3.
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
 * ONE TEMPLATE PER FAMILY, NOT TWO. 06 §3.3 asks for light and dark, and the
 * variant is the SCHEME rather than a second document: every colour is a
 * `{{brand.*}}` token, so the same template renders light or dark by which
 * palette resolves (see brand.ts). A second document per family would be a
 * second thing to keep in step, and the one that drifted would be the dark
 * one nobody looks at.
 *
 * The LTR mirror A27 reserves for English is likewise not a second document:
 * every alignment here is logical and every inset is `inset-inline`, so the
 * mirror is a `direction` flip (06 §2.2).
 */

import type { DesignDocument, Layer } from './model.js'
import { SCHEMA_VERSION } from './model.js'
import { PRESETS } from './presets.js'

export type PosterFamily = 'talk' | 'workshop' | 'panel' | 'meetup' | 'announcement'
export type CertificateFamily = 'attendance' | 'presenter' | 'achievement'

export interface BaselineTemplate {
  family: PosterFamily | CertificateFamily
  purpose: 'poster' | 'certificate'
  /** The Arabic name an admin sees in the library (06 §3.3's own table). */
  name: string
  document: DesignDocument
}

/* ── the shared vocabulary ──────────────────────────────────────────────── */

const KUFI = 'Reem Kufi' // the display face for posters (06 §7.1)
const NASKH = 'Amiri' // the formal face for certificates
const BODY = 'IBM Plex Sans Arabic'

/** The Knowledge Network, as geometry: a thin silver rule with three nodes
 *  on it. Dots and lines, which is the whole permitted vocabulary. */
function networkRule(id: string, y: number, width: number): Layer[] {
  const x = 80
  const dot = (n: number, at: number): Layer => ({
    id: `${id}-node-${n}`,
    kind: 'shape',
    frame: { x: at - 5, y: y - 4, w: 10, h: 10 },
    shape: { type: 'ellipse', fill: '{{brand.node}}' },
    z: 3,
  })
  return [
    {
      id,
      kind: 'shape',
      frame: { x, y, w: width, h: 2 },
      shape: { type: 'rect', fill: '{{brand.spine}}' },
      z: 2,
    },
    dot(1, x + 40),
    dot(2, x + Math.round(width / 2)),
    dot(3, x + width - 40),
  ]
}

const logo = (): Layer => ({
  id: 'l_logo',
  kind: 'image',
  name: 'شعار المؤسسة',
  // Bound, never embedded: replacing the logo updates every template at once.
  image: { binding: 'brand.logoAssetId', fit: 'contain' },
  frame: { x: 80, y: 80, w: 160, h: 160 },
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

function posterDocument(family: PosterFamily): DesignDocument {
  const master = PRESETS.master
  const layers: Layer[] = [
    logo(),
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
    ...networkRule('l_rule', 720, 920),
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
      frame: { x: 80, y: 870, w: 920, h: 60 },
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
      frame: { x: 80, y: 940, w: 760, h: 60 },
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
    background: { type: 'solid', color: '{{brand.canvas}}' },
    layers,
  }
}

/* ── certificates ───────────────────────────────────────────────────────── */

const CERTIFICATE_NAMES: Record<CertificateFamily, string> = {
  attendance: 'شهادة حضور',
  presenter: 'شهادة تقديم',
  achievement: 'شهادة إنجاز',
}

function certificateDocument(family: CertificateFamily): DesignDocument {
  const master = PRESETS.cert_landscape
  const centre = { x: 300, w: master.width - 600 }

  const layers: Layer[] = [
    { ...logo(), frame: { x: Math.round(master.width / 2) - 110, y: 240, w: 220, h: 220 } },
    {
      id: 'l_org',
      kind: 'dynamic_field',
      name: 'اسم المؤسسة',
      frame: { x: centre.x, y: 500, w: centre.w, h: 80 },
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
      frame: { x: centre.x, y: 620, w: centre.w, h: 160 },
      text: { literal: CERTIFICATE_NAMES[family] },
      font: { family: NASKH, size: 128, minSize: 88, lineHeight: 1.4, letterSpacing: 0, weight: 600 },
      color: '{{brand.fgHeading}}',
      align: 'center',
      z: 10,
    },
    ...networkRule('l_rule', 830, master.width - 600).map((l) => ({ ...l, frame: { ...l.frame, x: l.frame.x + 220 } })),
    {
      id: 'l_recipient',
      kind: 'dynamic_field',
      name: 'اسم المستفيد',
      frame: { x: centre.x, y: 920, w: centre.w, h: 200 },
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
      frame: { x: centre.x, y: 1180, w: centre.w, h: 160 },
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
      frame: { x: centre.x, y: 1380, w: centre.w, h: 70 },
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
      frame: { x: 300, y: master.height - 620, w: 320, h: 320 },
      qr: { binding: 'certificate.verifyUrl', ecLevel: 'Q', quietZoneModules: 4 },
      // `fixed`: a QR that shrinks with the page is a QR that stops scanning
      // on the portrait variant.
      presets: { default: { anchor: 'block-end', scale: 'fixed' } },
      z: 20,
    },
    {
      id: 'l_serial',
      kind: 'dynamic_field',
      name: 'الرقم التسلسلي',
      locked: true,
      frame: { x: 660, y: master.height - 600, w: 900, h: 70 },
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
      frame: { x: 660, y: master.height - 520, w: 900, h: 70 },
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
      frame: { x: master.width - 900, y: master.height - 480, w: 600, h: 2 },
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
    background: { type: 'solid', color: '{{brand.canvas}}' },
    layers,
  }
}

/** 06 §3.3's library: five poster families and three certificate families. */
export const BASELINE_LIBRARY: BaselineTemplate[] = [
  ...(['talk', 'workshop', 'panel', 'meetup', 'announcement'] as const).map((family) => ({
    family,
    purpose: 'poster' as const,
    name: POSTER_NAMES[family],
    document: posterDocument(family),
  })),
  ...(['attendance', 'presenter', 'achievement'] as const).map((family) => ({
    family,
    purpose: 'certificate' as const,
    name: CERTIFICATE_NAMES[family],
    document: certificateDocument(family),
  })),
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
