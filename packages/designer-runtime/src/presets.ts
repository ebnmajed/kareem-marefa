/**
 * Presets, safe areas, and how one master becomes seven aspect ratios —
 * 06 §5 and §5.1, A12, REQ-DSG-009, REQ-DSG-010.
 *
 * «Every variant derives from the master with NO MANUAL STEP.» Not by
 * scaling: 4:5 to 16:9 is not a scale, and a downscaled 1080-px raster is not
 * an `og` card. Each layer declares an ANCHOR and a BEHAVIOUR, and the
 * derivation reads them.
 *
 * Everything here is expressed against the SAFE BOX rather than the page,
 * because the safe box is what the composition actually lives in: a layer
 * sitting 80 px below the master's top edge is a layer sitting AT the top of
 * the safe area, and on `story` — whose safe inset is 120 — it belongs at 120,
 * not at 80. Anchoring to the page would drift every print preset inwards by
 * the difference and nobody would notice until the bleed was trimmed.
 */

import type { DesignDocument, Layer, Purpose } from './model.js'

export type PresetName =
  | 'master'
  | 'square'
  | 'story'
  | 'landscape'
  | 'og'
  | 'a4'
  | 'a3'
  | 'cert_landscape'
  | 'cert_portrait'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Preset {
  name: PresetName
  purpose: Purpose
  width: number
  height: number
  dpi: number
  /** Logical insets, so a direction flip mirrors them for free. */
  safe: { blockStart: number; blockEnd: number; inlineStart: number; inlineEnd: number }
  /** Print bleed, in pixels at this preset's dpi. Zero for screen presets. */
  bleed: number
}

/** 5 mm and 3 mm are stated in millimetres by 06 §5 because they are a
 *  printer's numbers; the pixel value follows from the dpi, so changing the
 *  dpi cannot silently change the margin. */
const mm = (value: number, dpi: number) => Math.round((value * dpi) / 25.4)

const PRINT_SAFE_MM = 5
const PRINT_BLEED_MM = 3

function print(name: PresetName, purpose: Purpose, width: number, height: number): Preset {
  const dpi = 300
  const inset = mm(PRINT_SAFE_MM, dpi)
  return {
    name,
    purpose,
    width,
    height,
    dpi,
    safe: { blockStart: inset, blockEnd: inset, inlineStart: inset, inlineEnd: inset },
    bleed: mm(PRINT_BLEED_MM, dpi),
  }
}

function screen(name: PresetName, width: number, height: number, block: number, inline = 80): Preset {
  return {
    name,
    purpose: 'poster',
    width,
    height,
    dpi: 72,
    safe: { blockStart: block, blockEnd: block, inlineStart: inline, inlineEnd: inline },
    bleed: 0,
  }
}

/** 06 §5's table, verbatim. */
export const PRESETS: Record<PresetName, Preset> = {
  master: screen('master', 1080, 1350, 80),
  square: screen('square', 1080, 1080, 80),
  // 06 §5 states 120 top/bottom for `story` and nothing for the sides, so the
  // sides keep the master's 80: a story is tall, not narrow.
  story: screen('story', 1080, 1920, 120, 80),
  landscape: screen('landscape', 1920, 1080, 100, 100),
  og: screen('og', 1200, 630, 72, 72),
  a4: print('a4', 'poster', 2480, 3508),
  a3: print('a3', 'poster', 3508, 4961),
  cert_landscape: print('cert_landscape', 'certificate', 3508, 2480),
  cert_portrait: print('cert_portrait', 'certificate', 2480, 3508),
}

export const POSTER_PRESETS: PresetName[] = ['master', 'square', 'story', 'landscape', 'og', 'a4', 'a3']
export const CERTIFICATE_PRESETS: PresetName[] = ['cert_landscape', 'cert_portrait']

export function presetsFor(purpose: Purpose): PresetName[] {
  return purpose === 'poster' ? POSTER_PRESETS : CERTIFICATE_PRESETS
}

/**
 * The presets THIS document is exported at.
 *
 * A poster derives all seven from its 4:5 master. A certificate is exported
 * at the ONE page its own master is composed for (DEC-148): a landscape
 * certificate derived into portrait put every line into the top 29% of the
 * page over a 157 mm empty band (measured), so a portrait certificate is a
 * portrait composition, chosen at issue time, and never a derivation.
 */
export function presetsForDocument(doc: Pick<DesignDocument, 'purpose' | 'master'>): PresetName[] {
  if (doc.purpose === 'poster') return POSTER_PRESETS
  return [doc.master.width >= doc.master.height ? 'cert_landscape' : 'cert_portrait']
}

/** The area a composition may occupy. Content is constrained to it (A12) and
 *  anything still crossing it is flagged before export (REQ-DSG-010). */
export function safeBox(preset: Preset): Box {
  return {
    x: preset.safe.inlineStart,
    y: preset.safe.blockStart,
    w: preset.width - preset.safe.inlineStart - preset.safe.inlineEnd,
    h: preset.height - preset.safe.blockStart - preset.safe.blockEnd,
  }
}

/** The preset a document was authored at, when its master matches one. */
export function presetMatching(doc: DesignDocument): Preset | null {
  return Object.values(PRESETS).find((p) => p.width === doc.master.width && p.height === doc.master.height) ?? null
}

/**
 * The source composition's safe box.
 *
 * A document authored at a known preset uses that preset's insets. One
 * authored at some other size keeps the master's PROPORTION of inset (80 of
 * 1080 on the inline axis, 80 of 1350 on the block axis) rather than its
 * pixel value — an inset in pixels means nothing on a canvas of a different
 * size, and guessing 80 on a 400-px document would leave no composition at all.
 */
export function sourceSafeBox(doc: DesignDocument): Box {
  const matched = presetMatching(doc)
  if (matched) return safeBox(matched)
  const master = PRESETS.master
  const inline = Math.round((master.safe.inlineStart / master.width) * doc.master.width)
  const block = Math.round((master.safe.blockStart / master.height) * doc.master.height)
  return { x: inline, y: block, w: doc.master.width - inline * 2, h: doc.master.height - block * 2 }
}

/* ── per-layer preset behaviour (06 §5.1) ───────────────────────────────── */

export type Anchor = 'block-start' | 'block-end' | 'center'
export type ScaleMode = 'proportional' | 'fixed' | 'fill'

export interface LayerPresetBehaviour {
  /** Where the layer sits when the canvas reflows. */
  anchor?: Anchor
  /** How its frame responds. */
  scale?: ScaleMode
  /** The per-variant crop override (A32). */
  focal?: { x: number; y: number }
}

function behaviourFor(layer: Layer, target: PresetName): LayerPresetBehaviour & Required<Pick<LayerPresetBehaviour, 'anchor' | 'scale'>> {
  // A per-preset entry overrides `default` field by field, so declaring a
  // crop for `og` does not silently drop the anchor `default` set.
  const fallback = layer.presets?.default ?? {}
  const declared = layer.presets?.[target] ?? {}
  return {
    anchor: declared.anchor ?? fallback.anchor ?? 'block-start',
    scale: declared.scale ?? fallback.scale ?? 'proportional',
    ...(declared.focal ?? fallback.focal ? { focal: declared.focal ?? fallback.focal } : {}),
  }
}

/* ── derivation ─────────────────────────────────────────────────────────── */

/**
 * The master document, rendered for one preset. A pure function: the same
 * document and the same preset produce the same result, on any machine — which
 * is what lets Tier A compare an editor's variant against the worker's.
 *
 * Layers listed in `hideAt` are DROPPED, not shrunk. 06 §5.1's own words:
 * «layers that do not survive a crop are declared, not discovered.»
 */
export function derive(doc: DesignDocument, target: PresetName): DesignDocument {
  const preset = PRESETS[target]
  const src = sourceSafeBox(doc)
  const dst = safeBox(preset)

  // One factor for size AND position, so the spacing between two layers
  // scales with them. Two factors would let a 4:5 → 16:9 crop stretch the gap
  // between a title and its date while both kept their own proportions.
  const proportional = Math.min(dst.w / src.w, dst.h / src.h)

  const layers = doc.layers
    .filter((l) => !(l.hideAt ?? []).includes(target))
    .map((layer): Layer => {
      const { anchor, scale, focal } = behaviourFor(layer, target)
      const f = layer.frame

      let w: number
      let h: number
      let factor: number
      if (scale === 'fixed') {
        // A QR at 25 mm is 25 mm on every preset (REQ-CRT-010): scaling it
        // with the page is how a certificate ends up with a QR too small to
        // scan on the smaller variant.
        w = f.w
        h = f.h
        factor = 1
      } else if (scale === 'fill') {
        factor = dst.w / f.w
        w = dst.w
        h = f.h * factor
      } else {
        factor = proportional
        w = f.w * factor
        h = f.h * factor
      }

      const inlineOffset = (f.x - src.x) * (scale === 'fill' ? 0 : factor)
      let x = dst.x + inlineOffset
      // Constrained to the safe area (A12) rather than left hanging over the
      // edge; what still does not fit is reported by safeAreaViolations().
      if (x + w > dst.x + dst.w) x = dst.x + dst.w - w
      if (x < dst.x) x = dst.x

      let y: number
      if (anchor === 'center') {
        y = dst.y + (dst.h - h) / 2
      } else if (anchor === 'block-end') {
        // Distance from the source safe box's BOTTOM is what a footer, a QR
        // or a signature block actually holds constant.
        const fromBottom = src.y + src.h - (f.y + f.h)
        y = dst.y + dst.h - fromBottom * factor - h
      } else {
        y = dst.y + (f.y - src.y) * factor
      }

      const scaled: Layer = { ...layer, frame: { ...f, x: round(x), y: round(y), w: round(w), h: round(h) } }

      // A32: the crop this variant should centre on. Automatic cropping is
      // centre-weighted and gets some posters wrong; a declared focal point
      // for THIS preset is the admin's correction, and it must not leak to
      // the others.
      if (focal && scaled.kind === 'image') {
        scaled.image = { ...scaled.image, focal }
      }

      // Text re-fits per preset, so the `og` variant's title is genuinely
      // smaller rather than a downscaled raster (06 §5.1). Auto-fit then runs
      // against this size at render time.
      if ((scaled.kind === 'text' || scaled.kind === 'dynamic_field') && factor !== 1) {
        scaled.font = {
          ...scaled.font,
          size: Math.max(1, round(scaled.font.size * factor)),
          ...(scaled.font.minSize !== undefined ? { minSize: Math.max(1, round(scaled.font.minSize * factor)) } : {}),
        }
      }
      return scaled
    })

  return {
    ...doc,
    master: { width: preset.width, height: preset.height, unit: 'px', dpi: preset.dpi },
    layers,
  }
}

/** Halves are a real pixel difference between two renderers; integers are not. */
const round = (n: number) => Math.round(n)

/* ── the safe-area check (REQ-DSG-010) ──────────────────────────────────── */

export type SafeEdge = 'inlineStart' | 'inlineEnd' | 'blockStart' | 'blockEnd'

export interface SafeAreaViolation {
  preset: PresetName
  layerId: string
  /** Which edges it crosses, and by how many pixels — so the message can say
   *  WHICH layer and WHICH preset rather than "something overflows". */
  edges: Array<{ edge: SafeEdge; overflowPx: number }>
}

/**
 * Content crossing a safe area, flagged BEFORE export rather than after
 * (REQ-DSG-010). `derive()` already pulls what it can back inside; what
 * reaches here is a layer too large for the target's safe box, which no
 * automatic step can fix — someone has to shrink it or declare `hideAt`.
 */
export function safeAreaViolations(doc: DesignDocument, target: PresetName): SafeAreaViolation[] {
  const derived = derive(doc, target)
  const box = safeBox(PRESETS[target])
  const out: SafeAreaViolation[] = []

  for (const layer of derived.layers) {
    if (layer.hidden) continue
    const f = layer.frame
    const edges: SafeAreaViolation['edges'] = []
    if (f.x < box.x) edges.push({ edge: 'inlineStart', overflowPx: round(box.x - f.x) })
    if (f.y < box.y) edges.push({ edge: 'blockStart', overflowPx: round(box.y - f.y) })
    if (f.x + f.w > box.x + box.w) edges.push({ edge: 'inlineEnd', overflowPx: round(f.x + f.w - (box.x + box.w)) })
    if (f.y + f.h > box.y + box.h) edges.push({ edge: 'blockEnd', overflowPx: round(f.y + f.h - (box.y + box.h)) })
    if (edges.length) out.push({ preset: target, layerId: layer.id, edges })
  }
  return out
}

/** Every preset a document will be exported at, checked at once — the list
 *  SCR-057 shows before an admin approves anything. */
export function allSafeAreaViolations(doc: DesignDocument): SafeAreaViolation[] {
  return presetsForDocument(doc).flatMap((preset) => safeAreaViolations(doc, preset))
}

/* ── alignment guides and snapping (06 §10, REQ-DSG-022) ────────────────── */

/**
 * The edges a layer can snap to, in LOGICAL coordinates.
 *
 * «Guides are logical (start/end), so they mirror with direction.» That is
 * the whole reason this returns numbers in the document's own coordinate
 * space rather than screen pixels: a guide computed from a rendered position
 * would be a guide that jumps to the other side when the template is
 * mirrored for English (A27).
 */
export function snapTargets(doc: DesignDocument, exceptLayerId: string): number[] {
  const box = sourceSafeBox(doc)
  const targets = new Set<number>([box.x, box.x + box.w, Math.round(box.x + box.w / 2), 0, doc.master.width])
  for (const layer of doc.layers) {
    if (layer.id === exceptLayerId || layer.hidden) continue
    targets.add(layer.frame.x)
    targets.add(layer.frame.x + layer.frame.w)
  }
  return [...targets].sort((a, b) => a - b)
}

export function snapTargetsBlock(doc: DesignDocument, exceptLayerId: string): number[] {
  const box = sourceSafeBox(doc)
  const targets = new Set<number>([box.y, box.y + box.h, Math.round(box.y + box.h / 2), 0, doc.master.height])
  for (const layer of doc.layers) {
    if (layer.id === exceptLayerId || layer.hidden) continue
    targets.add(layer.frame.y)
    targets.add(layer.frame.y + layer.frame.h)
  }
  return [...targets].sort((a, b) => a - b)
}

/** The nearest target within `tolerance`, or the value unchanged. Snapping a
 *  TYPED number rather than a dragged one: the properties panel is where
 *  frames are edited (dragging is deliberately absent), and 3 px of slop on
 *  a 1080 px canvas is the difference between "aligned" and "nearly". */
export function snap(value: number, targets: readonly number[], tolerance = 8): number {
  let best = value
  let distance = tolerance + 1
  for (const target of targets) {
    const d = Math.abs(target - value)
    if (d <= tolerance && d < distance) {
      distance = d
      best = target
    }
  }
  return best
}
