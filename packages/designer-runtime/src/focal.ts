/**
 * The focal point — REQ-DSG-030, A31, A32, DEC-093 path 3.
 *
 * An image layer's `image.focal` is where a `cover` crop centres; a preset's
 * `presets[name].focal` is A32's per-variant override. The renderer turns it
 * into `object-position` (`render.ts`) and `derive()` threads the override
 * (`presets.ts`) — both since M6, so nothing here changes a render.
 *
 * ★ `object-position` IS PHYSICAL. `x: 0` is the image's LEFT edge whatever the
 * page's direction — the grid that sets it is drawn left-to-right for that
 * reason, and its names say left and right, never start and end.
 *
 * ★ THE CENTRE IS THE ABSENCE OF A VALUE. An untouched layer has no `focal`,
 * and choosing «الوسط» on it writes nothing: otherwise the first person to
 * look at the grid would change the document's bytes, its fingerprint, and
 * every export's cache key for a picture that did not move (REQ-DSG-030's
 * «an untouched document derives identically»).
 */

import type { DesignDocument, ImageLayer } from './model.js'

export interface FocalPoint {
  x: number
  y: number
}

/** The nine-point grid, row by row from the top, each row left to right —
 *  PHYSICAL, like `object-position`. */
export const FOCAL_GRID: readonly FocalPoint[] = [0, 0.5, 1].flatMap((y) => [0, 0.5, 1].map((x) => ({ x, y })))

const tidy = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100) / 100

/** The focal point a preset shows: its own override, else the layer's, else the centre. */
export function focalOf(layer: ImageLayer, preset?: string): FocalPoint {
  const own = preset ? layer.presets?.[preset]?.focal : undefined
  return own ?? layer.image.focal ?? { x: 0.5, y: 0.5 }
}

/**
 * Sets an image layer's focal point — the layer's own when `preset` is
 * omitted, A32's per-variant override when it is named. Two decimals, inside
 * 0…1. Choosing the centre where nothing is set is a no-op (see above).
 */
export function setFocal(doc: DesignDocument, layerId: string, focal: FocalPoint, preset?: string): DesignDocument {
  const layer = doc.layers.find((l) => l.id === layerId)
  if (!layer || layer.kind !== 'image') return doc
  const point = { x: tidy(focal.x), y: tidy(focal.y) }
  const current = preset ? layer.presets?.[preset]?.focal : layer.image.focal
  const centre = point.x === 0.5 && point.y === 0.5
  if ((current === undefined && centre) || (current && current.x === point.x && current.y === point.y)) return doc

  const next: ImageLayer = preset
    ? { ...layer, presets: { ...layer.presets, [preset]: { ...(layer.presets?.[preset] ?? {}), focal: point } } }
    : { ...layer, image: { ...layer.image, focal: point } }
  return { ...doc, layers: doc.layers.map((l) => (l.id === layerId ? next : l)) }
}
