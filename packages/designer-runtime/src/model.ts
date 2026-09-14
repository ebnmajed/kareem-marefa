/**
 * The designer document model — docs/plan/06-visual-designer.md §2.
 *
 * One model serves both posters and certificates (D54, REQ-DSG-004). A document
 * is fully self-describing: nothing about its appearance lives outside it
 * (REQ-DSG-005).
 */

/** Bumped on any breaking change. Older versions must keep rendering — a
 *  certificate issued in 2026 has to regenerate in 2031 (REQ-CRT-014). */
export const SCHEMA_VERSION = 1

export type Purpose = 'poster' | 'certificate'
export type Direction = 'rtl' | 'ltr'
export type LayerKind = 'text' | 'image' | 'shape' | 'qr' | 'dynamic_field'

/** Logical, never `left`/`right`. The mirrored LTR template variants (A27) are
 *  then a direction flip rather than a second layout — REQ-DSG-026. */
export type LogicalAlign = 'start' | 'center' | 'end'

export interface Frame {
  x: number
  y: number
  w: number
  h: number
  rotation?: number
}

export interface FontSpec {
  family: string
  /** SHA-256 of the exact binary. Templates pin this so reissuing an old
   *  certificate is byte-reproducible (REQ-CRT-014, A39). */
  hash?: string
  size: number
  /** Auto-fit shrinks toward this and never below it (REQ-DSG-025). */
  minSize?: number
  lineHeight?: number
  /** A30: always 0 on Arabic. Letter-spacing breaks the cursive join — that is
   *  a broken word, not a loose one. */
  letterSpacing?: 0
  weight?: 400 | 500 | 600
}

export interface AutoFit {
  mode: 'shrink-then-wrap'
  maxLines?: number
}

interface LayerBase {
  id: string
  kind: LayerKind
  frame: Frame
  opacity?: number
  z?: number
  /** Locked regions cannot be moved, resized, hidden or deleted in the org
   *  editor (REQ-DSG-024) — a certificate whose QR was dragged off the page
   *  cannot be verified, and that only shows up after printing. */
  locked?: boolean
  /** Hidden is listed beside moved, resized and deleted in REQ-DSG-024, so it
   *  has to be a field the guard can see rather than an opacity of 0 nobody
   *  recognises as hiding. */
  hidden?: boolean
  /** The label in the editor's layer list. Never rendered. Falls back to the
   *  binding or the literal, so a template author is not forced to name
   *  every layer twice. */
  name?: string
  /** Per-preset anchor and scale behaviour (06 §5.1). `default` applies to
   *  every preset that names no override. Typed loosely here and resolved in
   *  `presets.ts`, so the model does not import the preset table and the
   *  preset table does not have to re-declare the layer. */
  presets?: { default?: LayerPresetOverride } & Partial<Record<string, LayerPresetOverride>>
  /** Presets this layer does not survive. 06 §5.1: «layers that do not
   *  survive a crop are DECLARED, not discovered» — an `og` card is 1200×630
   *  and a three-line abstract does not belong on it, and finding that out
   *  from a cramped link preview is finding it out too late. */
  hideAt?: string[]
}

/** The shape of one per-preset override. `presets.ts` owns the meaning. */
export interface LayerPresetOverride {
  anchor?: 'block-start' | 'block-end' | 'center'
  scale?: 'proportional' | 'fixed' | 'fill'
  /** The per-variant crop override (A32, REQ-DSG-020). Automatic cropping
   *  gets some cases wrong — a poster with its title at the bottom, a logo
   *  in a corner a 16:9 crop would cut — and this is the escape hatch: the
   *  admin adjusts the crop for THAT variant, and the others keep the
   *  layer's own focal point. */
  focal?: { x: number; y: number }
}

export interface TextLayer extends LayerBase {
  kind: 'text'
  text: { binding?: string; literal?: string; fallback?: string }
  font: FontSpec
  align?: LogicalAlign
  /** A `{{brand.*}}` token, never a hex literal — that is what makes
   *  "one edit in one place" true rather than aspirational (REQ-DSG-021). */
  color?: string
  autoFit?: AutoFit
}

export interface ImageLayer extends LayerBase {
  kind: 'image'
  image: {
    binding?: string
    assetId?: string
    fit?: 'contain' | 'cover'
    /** Drives automatic variant cropping, so a 4:5 → 16:9 crop centres on the
     *  subject rather than the geometry (A31). */
    focal?: { x: number; y: number }
  }
}

export interface ShapeLayer extends LayerBase {
  kind: 'shape'
  shape: { type: 'rect' | 'ellipse' | 'line'; fill?: string; stroke?: string; strokeWidth?: number }
}

export interface QrLayer extends LayerBase {
  kind: 'qr'
  /** Always an absolute URL — phone cameras need a URL, not raw text
   *  (REQ-DSG-023, REQ-CRT-010). */
  qr: { binding: string; ecLevel?: 'L' | 'M' | 'Q' | 'H'; quietZoneModules?: number }
}

export interface DynamicFieldLayer extends LayerBase {
  kind: 'dynamic_field'
  field: { binding: string; format?: string; fallback?: string }
  font: FontSpec
  align?: LogicalAlign
  color?: string
  autoFit?: AutoFit
}

export type Layer = TextLayer | ImageLayer | ShapeLayer | QrLayer | DynamicFieldLayer

export interface DesignDocument {
  schemaVersion: number
  purpose: Purpose
  master: { width: number; height: number; unit: 'px'; dpi?: number }
  /** RTL is the source composition (D5). LTR is the mirror, never the other
   *  way round. */
  direction: Direction
  background?: { type: 'solid'; color: string }
  layers: Layer[]
}

/** A font in the manifest — the single list the editor, the worker's Chromium
 *  and the worker's LibreOffice all read (REQ-DSG-016). Content-addressed, so
 *  a drift is a different filename rather than a silently different render. */
export interface ManifestFont {
  family: string
  weight: number
  style: string
  /** 'arabic' | 'latin'. Both must be pinned: unpinned Latin falls back to
   *  whatever the host has, which differs between a laptop, a container and a
   *  CI runner — and an export whose glyphs depend on the host is not
   *  reproducible. */
  script?: string
  sha256: string
  bytes?: number
  /** The CSS `unicode-range` this face covers. The manifest lists one entry
   *  per (family, weight, style, SCRIPT), and two faces of the same family
   *  declared without a range do not merge coverage — the LAST one wins for
   *  every character, so a mixed «جلسة عن Next.js» loses its Latin to a host
   *  font. Optional: a consumer that inlines a single face (the parity
   *  harness) omits it and the declaration is unchanged. */
  unicodeRange?: string
}

/**
 * The Arabic subset's range, as Google Fonts publishes it.
 *
 * ★ NOT APPLIED, and the reason is measured rather than reasoned. A family
 * whose Arabic and Latin subsets are two files looks like it needs a range
 * on each — and giving one to the Arabic face alone makes Arabic WORSE: the
 * unranged Latin face still matches every character and, being declared
 * last, still wins, but now the browser resolves the missing glyph to a
 * SYSTEM font instead of falling back to the Arabic face in the same
 * family. Measured on IBM Plex Sans Arabic: «محمد» is 88.05 with no ranges
 * and 76.02 — the system fallback's own width — with the range.
 *
 * With no ranges at all, CSS font matching does the right thing by itself:
 * the last face wins, and when it lacks the glyph the search continues
 * through the rest of the family before leaving it. So the faces are
 * declared plainly and this constant is kept only to name what was tried.
 */
export const ARABIC_UNICODE_RANGE =
  'U+0600-06FF, U+0750-077F, U+0870-088E, U+08A0-08FF, U+200C-200E, U+2010-2011, U+204F, ' +
  'U+2E41, U+FB50-FDFF, U+FE70-FEFF, U+10E60-10E7E, U+1EE00-1EEFF'

