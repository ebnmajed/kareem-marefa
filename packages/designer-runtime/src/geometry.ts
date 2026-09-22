/**
 * The studio's pointer geometry — drag, eight-handle resize, rotate, nudge,
 * snap and the marquee (REQ-DSG-028, DEC-077, DEC-093, DEC-096, DEC-178).
 *
 * ★ THE ONE PLACE THE DIRECTION ENTERS. A frame's `x` is the offset from the
 * document's INLINE START — the renderer positions every layer with
 * `inset-inline-start` (`render.ts`) — so on an RTL page `x` grows leftwards.
 * A pointer, a handle and an arrow key are VISUAL: → is right on the screen
 * whatever the page's direction (DEC-096, as Figma, Canva and Illustrator do
 * it). Everything here works in PHYSICAL document pixels — `left` from the
 * page's left edge — and crosses back to logical `x` through `toLogical()`,
 * the only function that knows `W − x − w`. CSS rotation is not mirrored by
 * `dir`, so a rotation needs no mirroring at all: the direction affects
 * exactly one number.
 *
 * ★ HIT-TESTING IS THE BROWSER'S. The overlay draws each box at the same
 * physical place with the same `rotate(θ)` about the same centre the renderer
 * uses, and the browser hit-tests the rotated box. Nothing here tests a point
 * against a polygon; what needs maths is turning a pointer's movement into a
 * frame, which is what these functions are.
 *
 * Pure: frames in, frames out. Every stored number is a whole pixel or a whole
 * degree — a half pixel is a real difference between two renderers, and
 * Tier A compares geometry exactly (06 §9.3).
 */

import type { DesignDocument, Frame } from './model.js'
import { snap, snapTargets, snapTargetsBlock } from './presets.js'

/** A frame in PHYSICAL document pixels: `left` from the page's left edge. */
export interface PhysicalBox {
  left: number
  top: number
  width: number
  height: number
  rotation: number
}

/** A resize handle, by its VISUAL identity (DEC-096): `nw` is up-and-left on
 *  the screen in any direction; it writes back to logical coordinates. */
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

type Page = Pick<DesignDocument, 'direction' | 'master'>

const whole = (n: number) => Math.round(n)

/** A rotation, in whole degrees, in (−180, 180] — `validate.ts` allows ±360,
 *  and one angle has one stored form. */
export function normaliseRotation(deg: number): number {
  let r = whole(deg) % 360
  if (r > 180) r -= 360
  if (r <= -180) r += 360
  return r === 0 ? 0 : r // never −0
}

/** Logical → physical. The one direction switch, with `toLogical()`. */
export function toPhysical(frame: Frame, doc: Page): PhysicalBox {
  const left = doc.direction === 'rtl' ? doc.master.width - frame.x - frame.w : frame.x
  return { left, top: frame.y, width: frame.w, height: frame.h, rotation: frame.rotation ?? 0 }
}

/**
 * Physical → logical, rounded. A frame that had no `rotation` and still has
 * none keeps the key absent, so a move does not add bytes the renderer never
 * needed (and the fingerprint of an untouched field does not change).
 */
export function toLogical(box: PhysicalBox, doc: Page, previous?: Frame): Frame {
  const w = Math.max(1, whole(box.width))
  const h = Math.max(1, whole(box.height))
  const left = whole(box.left)
  const x = doc.direction === 'rtl' ? doc.master.width - left - w : left
  const frame: Frame = { x, y: whole(box.top), w, h }
  const rotation = normaliseRotation(box.rotation)
  if (rotation !== 0 || previous?.rotation !== undefined) frame.rotation = rotation
  return frame
}

/** The frame moved by a PHYSICAL delta in document pixels (a pointer's, or a
 *  nudge's). On an RTL page a move to the right is a smaller `x`. */
export function moveFrame(frame: Frame, dx: number, dy: number, doc: Page): Frame {
  const box = toPhysical(frame, doc)
  return toLogical({ ...box, left: box.left + dx, top: box.top + dy }, doc, frame)
}

/**
 * The frame resized from one handle by a PHYSICAL pointer delta.
 *
 * The delta is turned into the layer's own axes (rotated by −θ), the side
 * opposite the handle stays where it is on the page, and the result is
 * written back as a logical frame. `keepRatio` holds the proportion on a
 * corner handle — an image scaled from its corner should not distort.
 */
export function resizeFrame(frame: Frame, handle: ResizeHandle, dx: number, dy: number, doc: Page, options: { keepRatio?: boolean; minSize?: number } = {}): Frame {
  const min = Math.max(1, options.minSize ?? 1)
  const box = toPhysical(frame, doc)
  const theta = (box.rotation * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  // The pointer's movement along the layer's own width and height.
  const lx = dx * cos + dy * sin
  const ly = -dx * sin + dy * cos

  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const sy = handle.includes('s') ? 1 : handle.startsWith('n') ? -1 : 0

  let w = Math.max(min, box.width + sx * lx)
  let h = Math.max(min, box.height + sy * ly)
  if (options.keepRatio && sx !== 0 && sy !== 0) {
    const scale = Math.max(w / box.width, h / box.height)
    w = Math.max(min, box.width * scale)
    h = Math.max(min, box.height * scale)
  }
  const dw = w - box.width
  const dh = h - box.height

  // The opposite side is fixed, so the centre moves by half the growth, along
  // the layer's own axes, turned back onto the page.
  const hx = (sx * dw) / 2
  const hy = (sy * dh) / 2
  const cx = box.left + box.width / 2 + hx * cos - hy * sin
  const cy = box.top + box.height / 2 + hx * sin + hy * cos

  return toLogical({ left: cx - w / 2, top: cy - h / 2, width: w, height: h, rotation: box.rotation }, doc, frame)
}

/**
 * The rotation after the pointer moved from `start` to `pointer` around the
 * layer's centre, all in physical document pixels. `step` (15° with shift)
 * snaps the result. A rotation is visual, so no direction is involved.
 */
export function rotateFromPointer(centre: { x: number; y: number }, start: { x: number; y: number }, pointer: { x: number; y: number }, startRotation: number, step?: number): number {
  const from = Math.atan2(start.y - centre.y, start.x - centre.x)
  const to = Math.atan2(pointer.y - centre.y, pointer.x - centre.x)
  let deg = startRotation + ((to - from) * 180) / Math.PI
  if (step && step > 0) deg = Math.round(deg / step) * step
  return normaliseRotation(deg)
}

/** The page-aligned box a rotated layer covers, in physical document pixels —
 *  what a marquee intersects and what a group's bounds are made of. */
export function boundsOf(frame: Frame, doc: Page): { left: number; top: number; right: number; bottom: number } {
  const box = toPhysical(frame, doc)
  const theta = (box.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(theta))
  const sin = Math.abs(Math.sin(theta))
  const w = box.width * cos + box.height * sin
  const h = box.width * sin + box.height * cos
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 }
}

/** Whether two page-aligned boxes overlap — the marquee's rule is TOUCH, as
 *  Figma's is: a layer the rectangle reaches is selected. */
export function intersects(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }): boolean {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom
}

/**
 * Arrow-key nudge on the VISUAL axis (DEC-096): → moves right on the screen,
 * which is a smaller `x` on an RTL page. 1 px, or 10 with shift — the caller
 * passes the distance. Only the named layers move.
 */
export function nudgeLayers(doc: DesignDocument, layerIds: readonly string[], dx: number, dy: number): DesignDocument {
  if (layerIds.length === 0 || (dx === 0 && dy === 0)) return doc
  const ids = new Set(layerIds)
  return { ...doc, layers: doc.layers.map((l) => (ids.has(l.id) ? { ...l, frame: moveFrame(l.frame, dx, dy, doc) } : l)) }
}

/**
 * The pointer's snap tolerance, in DOCUMENT pixels, from a SCREEN distance.
 *
 * `snap()`'s default 8 is document pixels, which is 3.6 screen px on a 1080
 * poster at the studio's ~0.45 scale and 1.1 px on a 3508-wide certificate —
 * a guide nobody could feel (measured, `designer.md` W13.1 R2). Six screen
 * pixels feels the same on both. Typed numbers keep `snap()`'s 8.
 */
export function snapTolerance(scale: number, screenPx = 6): number {
  return Math.max(1, Math.round(screenPx / Math.max(scale, 0.01)))
}

export interface SnapResult {
  frame: Frame
  /** The LOGICAL coordinates a guide is drawn at — the inline axis's from the
   *  document's start edge, like the inspector's fields. */
  guides: { inline: number[]; block: number[] }
}

/**
 * A dragged frame, snapped. The layer offers its start edge, its end edge and
 * its centre on each axis; the nearest one within `tolerance` of a target wins.
 * The targets are `snapTargets()` / `snapTargetsBlock()` and the arithmetic is
 * `snap()` — the helpers are called here, never copied.
 */
export function snapFrame(doc: DesignDocument, layerId: string, frame: Frame, tolerance: number): SnapResult {
  const pick = (start: number, size: number, targets: readonly number[]) => {
    let best: { delta: number; at: number } | null = null
    for (const offset of [0, size, size / 2]) {
      const value = start + offset
      const snapped = snap(value, targets, tolerance)
      if (snapped === value && !targets.includes(value)) continue
      const delta = snapped - value
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, at: snapped }
    }
    return best
  }
  const inline = pick(frame.x, frame.w, snapTargets(doc, layerId))
  const block = pick(frame.y, frame.h, snapTargetsBlock(doc, layerId))
  return {
    frame: { ...frame, x: whole(frame.x + (inline?.delta ?? 0)), y: whole(frame.y + (block?.delta ?? 0)) },
    guides: { inline: inline ? [inline.at] : [], block: block ? [block.at] : [] },
  }
}
