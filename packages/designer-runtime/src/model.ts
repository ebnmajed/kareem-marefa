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
}
