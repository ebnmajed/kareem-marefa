/**
 * Document → HTML. The single renderer, shared by the app and the worker image.
 *
 * DEC-017 chose to bundle the renderer in the worker image rather than call a
 * route in the deployed app, trading automatic code identity for guaranteed
 * FONT identity — a font fetch failing in production yields a plausible-looking
 * poster with silently wrong Arabic, which is the D66 nightmare. Code identity
 * is recovered here: one package, one version, consumed by both, with a CI
 * parity gate turning skew into a build failure.
 *
 * The output is DOM/SVG, never a raster canvas (A28). Raster-canvas text APIs
 * do not shape Arabic — they render disconnected letterforms in visual order,
 * which looks like a font problem and is an architecture problem. This
 * repository already learned that: its OG card could not be made with satori
 * and is rendered from HTML through headless Chrome.
 */

import type { DesignDocument, Layer, ManifestFont } from './model.js'

export interface RenderOptions {
  /** Font binaries, base64. Inlined as data URIs so the render is hermetic and
   *  tied to exact bytes — no CDN, whose dynamically subset slices are not
   *  byte-stable and would break D66 invisibly (A39). */
  fonts: Array<ManifestFont & { base64: string }>
  /** Resolves `{{brand.*}}` tokens and dynamic-field bindings. */
  resolve?: (binding: string) => string | undefined
  /** Extra CSS appended after the base rules. */
  extraCss?: string
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export function fontFaceCss(fonts: RenderOptions['fonts']): string {
  return fonts
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};` +
        // `swap`, never `block`: block hides glyphs while metrics still resolve,
        // so measurements look correct and the capture comes back EMPTY. That
        // produced blank goldens twice before it was understood (DEC-024).
        `font-display:swap;src:url(data:font/woff2;base64,${f.base64}) format('woff2');}`,
    )
    .join('\n')
}

/**
 * The typographic invariants from A30, as CSS rather than as advice. Guidance a
 * component can ignore is guidance that will be ignored.
 */
export const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
.dr-root{position:relative;overflow:visible}
.dr-layer{position:absolute}
.dr-text{
  /* A30: letter-spacing is ALWAYS 0 on Arabic — it breaks the cursive join. */
  letter-spacing:0;
  /* A30: Arabic needs 10-15% more leading than Latin. */
  line-height:1.7;
  /* A30: never clip a text line. Marks are drawn above the em box, so
     overflow:hidden eats stacked tashkeel and changes the meaning. */
  overflow:visible;
  /* A30: no justification anywhere — browsers stretch inter-word spaces
     rather than applying kashida, which produces rivers. */
  text-align:start;
  white-space:pre-wrap;
}`

function layerStyle(l: Layer): string {
  const { x, y, w, h, rotation } = l.frame
  const bits = [
    `inset-inline-start:${x}px`, // logical, so a direction flip mirrors it
    `top:${y}px`,
    `width:${w}px`,
    `height:${h}px`,
  ]
  if (rotation) bits.push(`transform:rotate(${rotation}deg)`)
  if (l.opacity !== undefined) bits.push(`opacity:${l.opacity}`)
  if (l.z !== undefined) bits.push(`z-index:${l.z}`)
  return bits.join(';')
}

function renderLayer(l: Layer, resolve: NonNullable<RenderOptions['resolve']>): string {
  const style = layerStyle(l)

  if (l.kind === 'text' || l.kind === 'dynamic_field') {
    const binding = l.kind === 'text' ? l.text.binding : l.field.binding
    const literal = l.kind === 'text' ? l.text.literal : undefined
    const fallback = l.kind === 'text' ? l.text.fallback : l.field.fallback
    const value = literal ?? (binding ? resolve(binding) : undefined) ?? fallback ?? ''
    const f = l.font
    const type = [
      `font-family:'${f.family}'`,
      `font-size:${f.size}px`,
      `font-weight:${f.weight ?? 400}`,
      `line-height:${f.lineHeight ?? 1.7}`,
      `letter-spacing:0`,
      `text-align:${l.align ?? 'start'}`,
      l.color ? `color:${resolve(l.color) ?? l.color}` : '',
    ]
      .filter(Boolean)
      .join(';')
    // Every interpolated value is bidi-isolated. Without it, a title like
    // «جلسة عن Next.js 16» renders with the digits displaced (REQ-INT-007).
    return `<div class="dr-layer dr-text" data-layer="${esc(l.id)}" style="${style};${type}"><bdi>${esc(value)}</bdi></div>`
  }

  if (l.kind === 'shape') {
    const s = l.shape
    const fill = s.fill ? resolve(s.fill) ?? s.fill : 'transparent'
    const extra =
      s.type === 'ellipse' ? 'border-radius:50%' : s.stroke ? `border:${s.strokeWidth ?? 1}px solid ${s.stroke}` : ''
    return `<div class="dr-layer" data-layer="${esc(l.id)}" style="${style};background:${fill};${extra}"></div>`
  }

  if (l.kind === 'image') {
    const src = l.image.assetId ? resolve(l.image.assetId) : l.image.binding ? resolve(l.image.binding) : undefined
    const focal = l.image.focal ? `object-position:${l.image.focal.x * 100}% ${l.image.focal.y * 100}%` : ''
    return src
      ? `<img class="dr-layer" data-layer="${esc(l.id)}" src="${esc(src)}" style="${style};object-fit:${l.image.fit ?? 'contain'};${focal}" alt="">`
      : `<div class="dr-layer" data-layer="${esc(l.id)}" style="${style}"></div>`
  }

  // QR. Emitted as inline SVG by our own runtime, which is why it stays vector
  // and crisp at A3 despite DEC-009's no-SVG-upload rule — that rule is about
  // UPLOADED files. Generated markup from our own code is a different thing.
  const target = resolve(l.qr.binding) ?? ''
  return (
    `<div class="dr-layer dr-qr" data-layer="${esc(l.id)}" data-qr-target="${esc(target)}" ` +
    `data-qr-quiet="${l.qr.quietZoneModules ?? 4}" style="${style}"></div>`
  )
}

/** Renders a document to a standalone HTML string. */
export function renderDocumentToHtml(doc: DesignDocument, opts: RenderOptions): string {
  const resolve = opts.resolve ?? (() => undefined)
  const { width, height } = doc.master
  const bg = doc.background?.color ? resolve(doc.background.color) ?? doc.background.color : '#ffffff'

  return `<!doctype html><html dir="${doc.direction}" lang="${doc.direction === 'rtl' ? 'ar' : 'en'}">
<head><meta charset="utf-8"><style>
${fontFaceCss(opts.fonts)}
${BASE_CSS}
${opts.extraCss ?? ''}
</style></head>
<body style="margin:0;background:${bg}">
<div class="dr-root" style="width:${width}px;height:${height}px;background:${bg}">
${doc.layers
  .slice()
  .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
  .map((l) => renderLayer(l, resolve))
  .join('\n')}
</div>
</body></html>`
}
