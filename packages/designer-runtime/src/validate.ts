/**
 * The document validator — REQ-DSG-005.
 *
 * A document is fully described by its JSON, which means the JSON is the only
 * thing standing between an autosave and a render. This is what the Route
 * Handler runs before anything touches the database, and what the worker runs
 * before it drives Chromium.
 *
 * WHY THIS IS HAND-WRITTEN AND NOT ZOD. `@kareem/designer-runtime` has zero
 * dependencies, deliberately: the app, the worker image and the parity harness
 * all consume it, and the worker's `package.json` does not carry Zod. A
 * validator that forced a dependency into the one package all three share
 * would be a worse trade than a hundred lines of explicit checks. The Route
 * Handler still parses its own envelope with Zod, as CLAUDE.md requires; this
 * validates the tree inside it.
 *
 * Two checks here are invariants rather than shape:
 *
 *   · `letterSpacing` must be 0 or absent. A30: letter-spacing breaks the
 *     cursive join, so a spaced Arabic word is a BROKEN word, not a loose one.
 *     Nothing downstream can recover from it, so it is refused at the door.
 *   · a QR layer's quiet zone is at least 4 modules (REQ-CRT-010, A29). A QR
 *     with a thin quiet zone scans on a screen and fails on paper, which is
 *     the only place a certificate QR is ever used.
 */

import type { AutoFit, DesignDocument, FontSpec, Frame, Layer, LayerKind } from './model.js'
import { SCHEMA_VERSION } from './model.js'

export interface ValidationIssue {
  /** A JSON path into the document, e.g. `layers[2].font.size`. */
  path: string
  code: string
  message: string
}

export type ValidationResult = { ok: true; document: DesignDocument } | { ok: false; issues: ValidationIssue[] }

/** A poster master is 1080×1350 and A3 is 3508×4961; nothing legitimate is
 *  larger, and an unbounded canvas is a render that never finishes. */
const MAX_DIMENSION = 10_000
/** 06 §10's editor is a layer list a human reads. Beyond this it is a program. */
const MAX_LAYERS = 300
const LAYER_KINDS: readonly LayerKind[] = ['text', 'image', 'shape', 'qr', 'dynamic_field']
const LAYER_ID = /^[A-Za-z0-9_-]{1,64}$/

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

class Issues {
  readonly list: ValidationIssue[] = []
  add(path: string, code: string, message: string): void {
    this.list.push({ path, code, message })
  }
}

function frame(v: unknown, path: string, is: Issues): Frame | null {
  if (!isObj(v)) return is.add(path, 'frame_missing', 'a layer needs a frame'), null
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    if (!isNum(v[k])) return is.add(`${path}.${k}`, 'frame_number', `${k} must be a number`), null
  }
  const f = v as unknown as Frame
  if (f.w <= 0 || f.h <= 0) return is.add(path, 'frame_size', 'width and height must be positive'), null
  if (Math.abs(f.x) > MAX_DIMENSION || Math.abs(f.y) > MAX_DIMENSION || f.w > MAX_DIMENSION || f.h > MAX_DIMENSION) {
    return is.add(path, 'frame_range', `a frame may not exceed ${MAX_DIMENSION}px`), null
  }
  if (v.rotation !== undefined) {
    if (!isNum(v.rotation) || Math.abs(v.rotation) > 360) {
      return is.add(`${path}.rotation`, 'rotation_range', 'rotation must be a number between -360 and 360'), null
    }
  }
  return { x: f.x, y: f.y, w: f.w, h: f.h, ...(v.rotation !== undefined ? { rotation: f.rotation } : {}) }
}

function font(v: unknown, path: string, is: Issues): FontSpec | null {
  if (!isObj(v)) return is.add(path, 'font_missing', 'a text layer needs a font'), null
  if (!isStr(v.family) || v.family.trim() === '') return is.add(`${path}.family`, 'font_family', 'a font family is required'), null
  if (!isNum(v.size) || v.size <= 0 || v.size > 2000) return is.add(`${path}.size`, 'font_size', 'font size must be between 1 and 2000'), null
  if (v.hash !== undefined && (!isStr(v.hash) || !/^(sha256:)?[0-9a-f]{64}$/.test(v.hash))) {
    // REQ-CRT-014: the hash is what makes reissuing in 2031 byte-reproducible.
    return is.add(`${path}.hash`, 'font_hash', 'a pinned font hash must be a SHA-256'), null
  }
  if (v.minSize !== undefined && (!isNum(v.minSize) || v.minSize <= 0 || v.minSize > (v.size as number))) {
    return is.add(`${path}.minSize`, 'font_min_size', 'minSize must be positive and no larger than size'), null
  }
  if (v.lineHeight !== undefined && (!isNum(v.lineHeight) || v.lineHeight < 1 || v.lineHeight > 4)) {
    return is.add(`${path}.lineHeight`, 'font_line_height', 'lineHeight must be between 1 and 4'), null
  }
  if (v.letterSpacing !== undefined && v.letterSpacing !== 0) {
    // A30, and the one type error in this file that is a product rule.
    return is.add(`${path}.letterSpacing`, 'letter_spacing', 'letter-spacing must be 0 — it breaks the Arabic cursive join'), null
  }
  if (v.weight !== undefined && ![400, 500, 600].includes(v.weight as number)) {
    return is.add(`${path}.weight`, 'font_weight', 'weight must be 400, 500 or 600'), null
  }
  return v as unknown as FontSpec
}

function autoFit(v: unknown, path: string, is: Issues): AutoFit | undefined {
  if (v === undefined) return undefined
  if (!isObj(v) || v.mode !== 'shrink-then-wrap') {
    return is.add(path, 'autofit_mode', 'the only auto-fit mode is shrink-then-wrap'), undefined
  }
  if (v.maxLines !== undefined && (!Number.isInteger(v.maxLines) || (v.maxLines as number) < 1 || (v.maxLines as number) > 12)) {
    return is.add(`${path}.maxLines`, 'autofit_lines', 'maxLines must be between 1 and 12'), undefined
  }
  return v as unknown as AutoFit
}

function layer(v: unknown, index: number, seen: Set<string>, is: Issues): Layer | null {
  const path = `layers[${index}]`
  if (!isObj(v)) return is.add(path, 'layer_shape', 'a layer must be an object'), null

  if (!isStr(v.id) || !LAYER_ID.test(v.id)) {
    return is.add(`${path}.id`, 'layer_id', 'a layer id must be 1-64 characters of [A-Za-z0-9_-]'), null
  }
  if (seen.has(v.id)) return is.add(`${path}.id`, 'layer_id_duplicated', `two layers share the id ${v.id}`), null
  seen.add(v.id)

  if (!isStr(v.kind) || !LAYER_KINDS.includes(v.kind as LayerKind)) {
    return is.add(`${path}.kind`, 'layer_kind', `kind must be one of ${LAYER_KINDS.join(', ')}`), null
  }
  if (!frame(v.frame, `${path}.frame`, is)) return null

  if (v.opacity !== undefined && (!isNum(v.opacity) || v.opacity < 0 || v.opacity > 1)) {
    return is.add(`${path}.opacity`, 'opacity_range', 'opacity must be between 0 and 1'), null
  }
  if (v.z !== undefined && !Number.isInteger(v.z)) return is.add(`${path}.z`, 'z_integer', 'z must be an integer'), null
  for (const flag of ['locked', 'hidden'] as const) {
    if (v[flag] !== undefined && typeof v[flag] !== 'boolean') {
      return is.add(`${path}.${flag}`, 'flag_boolean', `${flag} must be a boolean`), null
    }
  }
  if (v.align !== undefined && !['start', 'center', 'end'].includes(v.align as string)) {
    // 06 §2.2: never left/right. A template written with physical alignment
    // has to be redrawn for English; one written logically does not.
    return is.add(`${path}.align`, 'align_logical', 'align must be start, center or end — never left or right'), null
  }

  switch (v.kind) {
    case 'text': {
      if (!isObj(v.text)) return is.add(`${path}.text`, 'text_missing', 'a text layer needs a text spec'), null
      for (const k of ['binding', 'literal', 'fallback'] as const) {
        if (v.text[k] !== undefined && !isStr(v.text[k])) return is.add(`${path}.text.${k}`, 'text_string', `${k} must be a string`), null
      }
      if (!font(v.font, `${path}.font`, is)) return null
      autoFit(v.autoFit, `${path}.autoFit`, is)
      break
    }
    case 'dynamic_field': {
      if (!isObj(v.field) || !isStr(v.field.binding) || v.field.binding.trim() === '') {
        return is.add(`${path}.field.binding`, 'field_binding', 'a dynamic field needs a binding'), null
      }
      if (!font(v.font, `${path}.font`, is)) return null
      autoFit(v.autoFit, `${path}.autoFit`, is)
      break
    }
    case 'image': {
      if (!isObj(v.image)) return is.add(`${path}.image`, 'image_missing', 'an image layer needs an image spec'), null
      if (v.image.fit !== undefined && !['contain', 'cover'].includes(v.image.fit as string)) {
        return is.add(`${path}.image.fit`, 'image_fit', 'fit must be contain or cover'), null
      }
      if (v.image.focal !== undefined) {
        const f = v.image.focal
        if (!isObj(f) || !isNum(f.x) || !isNum(f.y) || f.x < 0 || f.x > 1 || f.y < 0 || f.y > 1) {
          return is.add(`${path}.image.focal`, 'image_focal', 'a focal point is {x, y} in 0…1'), null
        }
      }
      break
    }
    case 'shape': {
      if (!isObj(v.shape) || !['rect', 'ellipse', 'line'].includes(v.shape.type as string)) {
        return is.add(`${path}.shape.type`, 'shape_type', 'shape type must be rect, ellipse or line'), null
      }
      if (v.shape.strokeWidth !== undefined && (!isNum(v.shape.strokeWidth) || v.shape.strokeWidth < 0 || v.shape.strokeWidth > 200)) {
        return is.add(`${path}.shape.strokeWidth`, 'stroke_width', 'strokeWidth must be between 0 and 200'), null
      }
      break
    }
    case 'qr': {
      if (!isObj(v.qr) || !isStr(v.qr.binding) || v.qr.binding.trim() === '') {
        return is.add(`${path}.qr.binding`, 'qr_binding', 'a QR layer needs a binding'), null
      }
      if (v.qr.ecLevel !== undefined && !['L', 'M', 'Q', 'H'].includes(v.qr.ecLevel as string)) {
        return is.add(`${path}.qr.ecLevel`, 'qr_ec', 'ecLevel must be L, M, Q or H'), null
      }
      const quiet = v.qr.quietZoneModules
      if (quiet !== undefined && (!Number.isInteger(quiet) || (quiet as number) < 4)) {
        // A QR with a thin quiet zone scans on a screen and fails on paper,
        // which is the only place a certificate QR is ever used.
        return is.add(`${path}.qr.quietZoneModules`, 'qr_quiet_zone', 'the quiet zone must be at least 4 modules'), null
      }
      break
    }
  }

  return v as unknown as Layer
}

/** A gradient needs two stops to be one (CSS refuses `linear-gradient()`
 *  with fewer), and eight is already more than any composition here uses. */
const MAX_GRADIENT_STOPS = 8

/**
 * A solid fill or a gradient — DEC-127.
 *
 * ★ This is the door the worker and the autosave Route Handler both go
 * through, so it had to learn the gradient BEFORE any gradient document
 * existed: while it said «a background is solid», every poster seeded with
 * DEC-127's background would have been refused by `regenerate_poster` and
 * no automatic poster would have rendered at all.
 *
 * `angle` is the RTL source composition's, 0…360; the renderer alone mirrors
 * it for an LTR document, so nothing here ever sees a mirrored angle. A
 * stop's `at` is a fraction of the gradient line, 0…1 — the same unit as
 * `image.focal` — and positions may not run backwards.
 */
function background(bg: unknown, is: Issues): void {
  if (!isObj(bg)) return is.add('background', 'background', 'a background is {type: "solid", color} or {type: "gradient", angle, stops}')

  if (bg.type === 'solid') {
    if (!isStr(bg.color) || bg.color.trim() === '') is.add('background.color', 'background_color', 'a solid background needs a colour')
    return
  }

  if (bg.type !== 'gradient') {
    return is.add('background.type', 'background_type', 'a background is solid or gradient')
  }
  if (!isNum(bg.angle) || bg.angle < 0 || bg.angle > 360) {
    is.add('background.angle', 'gradient_angle', 'a gradient angle is between 0 and 360 degrees')
  }
  if (!Array.isArray(bg.stops) || bg.stops.length < 2 || bg.stops.length > MAX_GRADIENT_STOPS) {
    return is.add('background.stops', 'gradient_stops', `a gradient has between 2 and ${MAX_GRADIENT_STOPS} stops`)
  }
  let previous = -Infinity
  bg.stops.forEach((stop, i) => {
    const path = `background.stops[${i}]`
    if (!isObj(stop) || !isStr(stop.color) || stop.color.trim() === '') {
      return is.add(`${path}.color`, 'gradient_stop_color', 'every gradient stop needs a colour')
    }
    if (stop.at !== undefined) {
      if (!isNum(stop.at) || stop.at < 0 || stop.at > 1) {
        return is.add(`${path}.at`, 'gradient_stop_at', 'a stop position is a fraction between 0 and 1')
      }
      if (stop.at < previous) {
        return is.add(`${path}.at`, 'gradient_stop_order', 'stop positions may not run backwards')
      }
      previous = stop.at
    }
  })
}

export function validateDocument(input: unknown): ValidationResult {
  const is = new Issues()
  if (!isObj(input)) {
    return { ok: false, issues: [{ path: '', code: 'not_an_object', message: 'a document must be a JSON object' }] }
  }

  if (!Number.isInteger(input.schemaVersion) || (input.schemaVersion as number) < 1) {
    is.add('schemaVersion', 'schema_version', 'schemaVersion must be a positive integer')
  } else if ((input.schemaVersion as number) > SCHEMA_VERSION) {
    // Older versions keep rendering (REQ-DSG-005); a NEWER one cannot, and
    // guessing would silently drop whatever the newer schema added.
    is.add('schemaVersion', 'schema_version_future', `this renderer understands schemaVersion up to ${SCHEMA_VERSION}`)
  }

  if (input.purpose !== 'poster' && input.purpose !== 'certificate') {
    is.add('purpose', 'purpose', 'purpose must be poster or certificate')
  }
  if (input.direction !== 'rtl' && input.direction !== 'ltr') {
    is.add('direction', 'direction', 'direction must be rtl or ltr')
  }

  const master = input.master
  if (!isObj(master) || !isNum(master.width) || !isNum(master.height)) {
    is.add('master', 'master', 'master needs a numeric width and height')
  } else if (master.width <= 0 || master.height <= 0 || master.width > MAX_DIMENSION || master.height > MAX_DIMENSION) {
    is.add('master', 'master_range', `master dimensions must be between 1 and ${MAX_DIMENSION}`)
  } else if (master.unit !== 'px') {
    is.add('master.unit', 'master_unit', 'the only unit is px — presets are declared in pixels (06 §5)')
  }

  if (input.background !== undefined) background(input.background, is)

  if (!Array.isArray(input.layers)) {
    is.add('layers', 'layers_missing', 'a document needs a layers array')
  } else if (input.layers.length > MAX_LAYERS) {
    is.add('layers', 'layers_too_many', `a document may not carry more than ${MAX_LAYERS} layers`)
  } else {
    const seen = new Set<string>()
    input.layers.forEach((l, i) => layer(l, i, seen, is))
  }

  if (is.list.length) return { ok: false, issues: is.list }
  return { ok: true, document: input as unknown as DesignDocument }
}
