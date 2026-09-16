/**
 * Align, fit and reorder — the studio's single-pointer paths (DEC-093, DEC-096,
 * REQ-DSG-028).
 *
 * ★ THESE ARE CONFORMANCE, NOT CONVENIENCE. `SC 2.5.7` requires every
 * dragged operation to have a non-dragging path; the inspector's numbers are
 * one (and are never removed), and these are the ones a person on a phone
 * with a tremor can actually use: a tap aligns, a tap fits, a tap reorders.
 *
 * ★ THE DOCUMENT'S AXIS, NEVER THE CONSOLE'S (DEC-096). A frame's `x` is the
 * offset from the document's INLINE START — the renderer positions every
 * layer with `inset-inline-start` — so «align start» here sets `x` to the
 * start of the box and knows nothing about the locale of the screen it was
 * pressed on. That is the whole point: an Arabic poster aligned from an
 * English console and from an Arabic one must store the same bytes, or a
 * template's render becomes a function of the editor's locale and a parity
 * golden moves for a reason no diff can show. These functions take no
 * direction argument, so they cannot be called with the wrong one.
 *
 * Pure: document in, document out, the input untouched. Every result is a
 * whole number of pixels — a half pixel is a real difference between two
 * renderers, and Tier A compares geometry exactly (06 §9.3).
 */

import type { DesignDocument, Layer } from './model.js'
import { type Box, sourceSafeBox } from './presets.js'

export type AlignAxis = 'inline' | 'block'
export type AlignEdge = 'start' | 'center' | 'end'
/** The safe area the composition lives in, or the whole page. */
export type AlignTarget = 'safe' | 'page'
export type ReorderMove = 'forward' | 'backward' | 'front' | 'back'

function boxFor(doc: DesignDocument, target: AlignTarget): Box {
  return target === 'safe' ? sourceSafeBox(doc) : { x: 0, y: 0, w: doc.master.width, h: doc.master.height }
}

function withLayer(doc: DesignDocument, layerId: string, change: (layer: Layer) => Layer): DesignDocument {
  if (!doc.layers.some((l) => l.id === layerId)) return doc
  return { ...doc, layers: doc.layers.map((l) => (l.id === layerId ? change(l) : l)) }
}

/**
 * One layer, aligned to the start, centre or end of the safe area or the page,
 * on one axis. On the inline axis `start` is the document's start edge — the
 * right of an RTL page, the left of an LTR one — because that is what `x`
 * measures.
 */
export function alignLayer(doc: DesignDocument, layerId: string, axis: AlignAxis, edge: AlignEdge, target: AlignTarget): DesignDocument {
  const box = boxFor(doc, target)
  return withLayer(doc, layerId, (layer) => {
    const f = layer.frame
    const place = (origin: number, span: number, size: number) =>
      Math.round(edge === 'start' ? origin : edge === 'end' ? origin + span - size : origin + (span - size) / 2)
    const frame = axis === 'inline' ? { ...f, x: place(box.x, box.w, f.w) } : { ...f, y: place(box.y, box.h, f.h) }
    return { ...layer, frame }
  })
}

/**
 * «لائم المنطقة الآمنة» — the layer shrunk only as far as it must be to fit
 * inside the safe area, then moved only as far as it must be. A layer that
 * already fits does not move at all: fitting is a correction, not a
 * re-layout.
 */
export function fitLayerToSafeArea(doc: DesignDocument, layerId: string): DesignDocument {
  const box = sourceSafeBox(doc)
  return withLayer(doc, layerId, (layer) => {
    const f = layer.frame
    const w = Math.min(f.w, box.w)
    const h = Math.min(f.h, box.h)
    const x = Math.min(Math.max(f.x, box.x), box.x + box.w - w)
    const y = Math.min(Math.max(f.y, box.y), box.y + box.h - h)
    return { ...layer, frame: { ...f, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } }
  })
}

/**
 * The stacking order the renderer paints: ascending `z`, ties in array order
 * (`render.ts` sorts a copy with a stable sort). Front is LAST.
 */
export function paintOrder(doc: DesignDocument): Layer[] {
  return doc.layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => (a.layer.z ?? 0) - (b.layer.z ?? 0) || a.index - b.index)
    .map((entry) => entry.layer)
}

/**
 * ▲ ▼ and «to the front» / «to the back» — DEC-093's second path, the
 * non-dragging way to reorder. Only the moved layer's `z` changes, except when
 * it swaps with a neighbour of EQUAL `z`, where the tie is broken by array
 * order and the two trade places in the array instead. Either way the rest of
 * the stack keeps its numbers, so a reorder is a small diff rather than a
 * renumbering of every layer.
 */
export function reorderLayer(doc: DesignDocument, layerId: string, move: ReorderMove): DesignDocument {
  const order = paintOrder(doc)
  const at = order.findIndex((l) => l.id === layerId)
  if (at === -1) return doc
  const layer = order[at] as Layer
  const z = layer.z ?? 0

  if (move === 'front' || move === 'back') {
    // Already the front (or back) of the paint order: nothing to do, and
    // nothing written — a no-op must not become an autosave.
    if ((move === 'front' && at === order.length - 1) || (move === 'back' && at === 0)) return doc
    const others = order.filter((l) => l.id !== layerId).map((l) => l.z ?? 0)
    const target = move === 'front' ? Math.max(...others) + 1 : Math.min(...others) - 1
    return withLayer(doc, layerId, (l) => ({ ...l, z: target }))
  }

  const neighbourAt = move === 'forward' ? at + 1 : at - 1
  const neighbour = order[neighbourAt]
  if (!neighbour) return doc
  const nz = neighbour.z ?? 0

  if (nz !== z) {
    return {
      ...doc,
      layers: doc.layers.map((l) => (l.id === layerId ? { ...l, z: nz } : l.id === neighbour.id ? { ...l, z } : l)),
    }
  }
  // Equal z: paint order is array order, so trade array positions.
  const i = doc.layers.findIndex((l) => l.id === layerId)
  const j = doc.layers.findIndex((l) => l.id === neighbour.id)
  const layers = doc.layers.slice()
  layers[i] = neighbour
  layers[j] = layer
  return { ...doc, layers }
}
