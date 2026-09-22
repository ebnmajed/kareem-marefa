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
import { normaliseRotation } from './geometry.js'

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

/* ── wave 13: groups, tap-to-place, rotation and width by a tap (DEC-178) ───
 *
 * Added beside the three above, which are unchanged. Every one is again a
 * single tap — SC 2.5.7's path for what the canvas now also does by dragging —
 * and every one works on the DOCUMENT's axis and takes no direction.
 */

/** Align to the safe area, the page, or the SELECTION's own bounds. */
export type GroupAlignTarget = AlignTarget | 'selection'

/** The logical box the named layers' frames span. */
export function selectionBox(doc: DesignDocument, layerIds: readonly string[]): Box | null {
  const frames = doc.layers.filter((l) => layerIds.includes(l.id)).map((l) => l.frame)
  if (frames.length === 0) return null
  const x = Math.min(...frames.map((f) => f.x))
  const y = Math.min(...frames.map((f) => f.y))
  const w = Math.max(...frames.map((f) => f.x + f.w)) - x
  const h = Math.max(...frames.map((f) => f.y + f.h)) - y
  return { x, y, w, h }
}

/**
 * Several layers aligned at once. To the safe area or the page it is exactly
 * `alignLayer()` for each, so one layer and a group can never disagree; to
 * the selection, each is placed against the group's own bounds.
 */
export function alignLayers(doc: DesignDocument, layerIds: readonly string[], axis: AlignAxis, edge: AlignEdge, target: GroupAlignTarget): DesignDocument {
  if (target !== 'selection') return layerIds.reduce((d, id) => alignLayer(d, id, axis, edge, target), doc)
  const box = selectionBox(doc, layerIds)
  if (!box) return doc
  const ids = new Set(layerIds)
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (!ids.has(l.id)) return l
      const f = l.frame
      const [origin, span, size] = axis === 'inline' ? [box.x, box.w, f.w] : [box.y, box.h, f.h]
      const at = Math.round(edge === 'start' ? origin : edge === 'end' ? origin + span - size : origin + (span - size) / 2)
      return { ...l, frame: axis === 'inline' ? { ...f, x: at } : { ...f, y: at } }
    }),
  }
}

/**
 * Equal gaps between three or more layers on one axis, the two outermost
 * where they are. Ordered by their start on the document's axis, so the same
 * group distributes to the same bytes from any console. Fewer than three is a
 * no-op: two layers have one gap and nothing to equalise.
 */
export function distributeLayers(doc: DesignDocument, layerIds: readonly string[], axis: AlignAxis): DesignDocument {
  const members = doc.layers.filter((l) => layerIds.includes(l.id))
  if (members.length < 3) return doc
  const start = (f: Layer['frame']) => (axis === 'inline' ? f.x : f.y)
  const size = (f: Layer['frame']) => (axis === 'inline' ? f.w : f.h)
  const ordered = members.slice().sort((a, b) => start(a.frame) - start(b.frame) || doc.layers.indexOf(a) - doc.layers.indexOf(b))
  const first = ordered[0] as Layer
  const last = ordered[ordered.length - 1] as Layer
  const span = start(last.frame) + size(last.frame) - start(first.frame)
  const total = ordered.reduce((sum, l) => sum + size(l.frame), 0)
  const gap = (span - total) / (ordered.length - 1)

  const placed = new Map<string, number>()
  let cursor = start(first.frame)
  for (const l of ordered) {
    placed.set(l.id, Math.round(cursor))
    cursor += size(l.frame) + gap
  }
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const at = placed.get(l.id)
      if (at === undefined) return l
      return { ...l, frame: axis === 'inline' ? { ...l.frame, x: at } : { ...l.frame, y: at } }
    }),
  }
}

/** Tap-to-place: the layer's centre put on a point given in LOGICAL document
 *  coordinates (the canvas converts the tap). */
export function placeLayerCentre(doc: DesignDocument, layerId: string, point: { x: number; y: number }): DesignDocument {
  return withLayer(doc, layerId, (l) => ({ ...l, frame: { ...l.frame, x: Math.round(point.x - l.frame.w / 2), y: Math.round(point.y - l.frame.h / 2) } }))
}

/** ±15° by a tap, and «صفّر الدوران». Whole degrees in (−180, 180]. */
export function rotateLayer(doc: DesignDocument, layerId: string, degrees: number, mode: 'by' | 'to' = 'by'): DesignDocument {
  return withLayer(doc, layerId, (l) => {
    const next = mode === 'by' ? (l.frame.rotation ?? 0) + degrees : degrees
    return { ...l, frame: { ...l.frame, rotation: normaliseRotation(next) } }
  })
}

/** «املأ المنطقة الآمنة عرضًا» — the layer spans the safe area's width, its
 *  height kept. Resize by a tap. */
export function fillSafeWidth(doc: DesignDocument, layerId: string): DesignDocument {
  const box = sourceSafeBox(doc)
  return withLayer(doc, layerId, (l) => ({ ...l, frame: { ...l.frame, x: box.x, w: box.w } }))
}
