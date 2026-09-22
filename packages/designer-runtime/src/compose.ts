/**
 * Adding, duplicating and removing layers — the owner's «add images, logos,
 * text, format the text» (DEC-178, D1b; REQ-DSG-004, REQ-DSG-021, REQ-DSG-024).
 *
 * ★ EVERY NEW LAYER IS BRAND-BOUND. A colour is a `{{brand.*}}` token, never a
 * hex (REQ-DSG-021, `0055`'s guard): a layer added in the studio must survive
 * the same brand check a template does, and «one edit in one place» must stay
 * true for what an admin adds as much as for what the platform shipped.
 *
 * ★ A NEW LAYER STARTS INSIDE THE SAFE AREA, at the document's START edge —
 * `x` is the inline-start offset, so the same call places it on the right of an
 * Arabic poster and the left of an English one, and nothing here reads a
 * direction.
 *
 * Pure: document in, document out, the input untouched. Whole pixels.
 */

import type { DesignDocument, ImageLayer, Layer, ShapeLayer, TextLayer } from './model.js'
import { sourceSafeBox } from './presets.js'

export type NewLayerKind = 'text' | 'image' | 'logo' | 'shape'

/** An id no layer of this document has, readable in the layer list's fallback. */
export function nextLayerId(doc: DesignDocument, kind: string): string {
  const taken = new Set(doc.layers.map((l) => l.id))
  for (let n = 1; ; n++) {
    const id = `l_${kind}_${n}`
    if (!taken.has(id)) return id
  }
}

/** The z that paints above everything already there. */
function topZ(doc: DesignDocument): number {
  return doc.layers.length === 0 ? 0 : Math.max(...doc.layers.map((l) => l.z ?? 0)) + 1
}

export interface NewLayerOptions {
  /** The words of a new text layer — the caller's, because they are Arabic copy. */
  literal?: string
  /** The family a new text layer is set in: one of the editor's faces (REQ-DSG-016). */
  fontFamily?: string
  /** The design asset a new image layer shows (uploaded, sniffed, never SVG — DEC-009). */
  assetId?: string
  /** The editor's name for the layer. */
  name?: string
}

/** A new layer of `kind`, sized to the document and placed inside its safe area. */
export function newLayer(doc: DesignDocument, kind: NewLayerKind, options: NewLayerOptions = {}): Layer {
  const box = sourceSafeBox(doc)
  const id = nextLayerId(doc, kind)
  const z = topZ(doc)
  const name = options.name ? { name: options.name } : {}
  const unit = Math.round(Math.min(box.w, box.h) / 10)

  if (kind === 'text') {
    const size = Math.max(12, Math.round(unit * 0.6))
    const layer: TextLayer = {
      id,
      kind: 'text',
      ...name,
      z,
      frame: { x: box.x, y: box.y, w: Math.round(box.w * 0.6), h: Math.round(size * 1.7 * 2) },
      text: { literal: options.literal ?? '' },
      font: { family: options.fontFamily ?? 'IBM Plex Sans Arabic', size, weight: 500 },
      align: 'start',
      color: '{{brand.fgHeading}}',
      autoFit: { mode: 'shrink-then-wrap', maxLines: 3 },
    }
    return layer
  }

  if (kind === 'shape') {
    const w = unit * 3
    const h = unit * 2
    const layer: ShapeLayer = {
      id,
      kind: 'shape',
      ...name,
      z,
      frame: { x: Math.round(box.x + (box.w - w) / 2), y: Math.round(box.y + (box.h - h) / 2), w, h },
      shape: { type: 'rect', fill: '{{brand.surface}}' },
    }
    return layer
  }

  // An image or the org's logo. The logo is BOUND, never embedded, so
  // replacing it in the brand kit updates this layer too (REQ-DSG-021).
  const side = kind === 'logo' ? unit * 2 : unit * 4
  const layer: ImageLayer = {
    id,
    kind: 'image',
    ...name,
    z,
    frame:
      kind === 'logo'
        ? { x: box.x, y: box.y, w: side, h: side }
        : { x: Math.round(box.x + (box.w - side) / 2), y: Math.round(box.y + (box.h - side) / 2), w: side, h: side },
    image: kind === 'logo' ? { binding: 'brand.logoAssetId', fit: 'contain' } : { assetId: options.assetId ?? '', fit: 'contain' },
  }
  return layer
}

/** The document with `layer` on top of everything. */
export function addLayer(doc: DesignDocument, layer: Layer): DesignDocument {
  return { ...doc, layers: [...doc.layers, layer] }
}

/**
 * A copy of a layer, above it and 20 px further along both axes (toward the
 * document's end and bottom), under a new id. Its lock does not travel: a
 * locked region is the TEMPLATE's statement about its own layer (REQ-DSG-024),
 * and a copy of the QR is not the QR verification depends on.
 */
export function duplicateLayer(doc: DesignDocument, layerId: string): DesignDocument {
  const source = doc.layers.find((l) => l.id === layerId)
  if (!source) return doc
  const copy: Layer = structuredClone(source)
  delete copy.locked
  copy.id = nextLayerId(doc, source.kind)
  copy.z = topZ(doc)
  copy.frame = { ...source.frame, x: source.frame.x + 20, y: source.frame.y + 20 }
  return addLayer(doc, copy)
}

/** The document without the layer. The editor refuses a locked one first, and
 *  `design_documents_guard` refuses it again (REQ-DSG-024). */
export function removeLayer(doc: DesignDocument, layerId: string): DesignDocument {
  if (!doc.layers.some((l) => l.id === layerId)) return doc
  return { ...doc, layers: doc.layers.filter((l) => l.id !== layerId) }
}
