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
 *
 * The EDITOR renders the same markup. `renderDocumentToFragment()` returns the
 * canvas without the document wrapper, and SCR-057 mounts it directly, so the
 * canvas an admin looks at is produced by the same function as the artifact
 * that goes to print. Not "the same design" — the same code path (DEC-017).
 */

import { type BindingContext, EMPTY_BINDINGS, resolveColour, resolveRef, resolveText } from './bindings.js'
import type { DesignDocument, Layer, ManifestFont } from './model.js'

export interface RenderOptions {
  /** Font binaries. `base64` is inlined as a data URI so the render is
   *  hermetic and tied to exact bytes — no CDN, whose dynamically subset
   *  slices are not byte-stable and would break D66 invisibly (A39).
   *
   *  The editor passes `url` instead: the same bytes, addressed by SHA-256
   *  through `/api/fonts/…` rather than inlined, because an admin's canvas
   *  does not need a megabyte of base64 in its markup. Same bytes, same
   *  hash, same faces — that is what REQ-DSG-016 asks for, not the same
   *  transport. */
  fonts: Array<ManifestFont & { base64?: string; url?: string }>
  /** Resolved binding values (06 §2.3). An unbound field becomes a marked
   *  placeholder, never an empty box (REQ-DSG-006). */
  bindings?: BindingContext
  /** Extra CSS appended after the base rules. */
  extraCss?: string
}

/** `'` is escaped too: a font family carrying an apostrophe would otherwise
 *  close the quoted `font-family:'…'` and silently drop the face. */
const esc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

/** Inside a CSS string literal, not inside markup. */
const cssStr = (s: string): string => s.replace(/[\\'"\n\r]/g, '\\$&')

function fontSrc(f: RenderOptions['fonts'][number]): string | null {
  if (f.base64) return `url(data:font/woff2;base64,${f.base64}) format('woff2')`
  if (f.url) return `url('${cssStr(f.url)}') format('woff2')`
  return null
}

export function fontFaceCss(fonts: RenderOptions['fonts']): string {
  return fonts
    .map((f) => {
      const src = fontSrc(f)
      if (!src) return ''
      return (
        `@font-face{font-family:'${cssStr(f.family)}';font-style:${f.style};font-weight:${f.weight};` +
        // `swap`, never `block`: block hides glyphs while metrics still resolve,
        // so measurements look correct and the capture comes back EMPTY. That
        // produced blank goldens twice before it was understood (DEC-024).
        `font-display:swap;src:${src};` +
        (f.unicodeRange ? `unicode-range:${f.unicodeRange};` : '') +
        `}`
      )
    })
    .filter(Boolean)
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
}
/* REQ-DSG-006: an unbound field is MARKED, never blank. A blank exports as a
   space nobody notices until it is printed. */
.dr-placeholder{
  outline:2px dashed currentColor;
  outline-offset:2px;
  opacity:.55;
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

function renderLayer(l: Layer, ctx: BindingContext): string {
  const style = layerStyle(l)

  if (l.kind === 'text' || l.kind === 'dynamic_field') {
    const spec =
      l.kind === 'text'
        ? { binding: l.text.binding, literal: l.text.literal, fallback: l.text.fallback }
        : { binding: l.field.binding, fallback: l.field.fallback }
    const resolved = resolveText(ctx, spec)
    const f = l.font
    const type = [
      `font-family:'${cssStr(f.family)}'`,
      `font-size:${f.size}px`,
      `font-weight:${f.weight ?? 400}`,
      `line-height:${f.lineHeight ?? 1.7}`,
      `letter-spacing:0`,
      `text-align:${l.align ?? 'start'}`,
      `color:${resolveColour(ctx, l.color, 'inherit')}`,
    ].join(';')
    const marks = resolved.bound ? '' : ` dr-placeholder`
    const attr = resolved.bound ? '' : ` data-placeholder="${esc(resolved.binding)}"`
    // Every interpolated value is bidi-isolated. Without it, a title like
    // «جلسة عن Next.js 16» renders with the digits displaced (REQ-INT-007).
    return `<div class="dr-layer dr-text${marks}" data-layer="${esc(l.id)}"${attr} style="${style};${type}"><bdi>${esc(resolved.text)}</bdi></div>`
  }

  if (l.kind === 'shape') {
    const s = l.shape
    const fill = resolveColour(ctx, s.fill, 'transparent')
    const extra =
      s.type === 'ellipse'
        ? 'border-radius:50%'
        : s.stroke
          ? `border:${s.strokeWidth ?? 1}px solid ${resolveColour(ctx, s.stroke, 'transparent')}`
          : ''
    return `<div class="dr-layer" data-layer="${esc(l.id)}" style="${style};background:${fill};${extra}"></div>`
  }

  if (l.kind === 'image') {
    const src = resolveRef(ctx, l.image.assetId ?? l.image.binding)
    const focal = l.image.focal ? `;object-position:${l.image.focal.x * 100}% ${l.image.focal.y * 100}%` : ''
    return src
      ? `<img class="dr-layer" data-layer="${esc(l.id)}" src="${esc(src)}" style="${style};object-fit:${l.image.fit ?? 'contain'}${focal}" alt="">`
      : // An unbound image is a marked placeholder too: an org that has not
        // uploaded a logo must see that on the canvas, not discover it in print.
        `<div class="dr-layer dr-placeholder" data-layer="${esc(l.id)}" data-placeholder="${esc(l.image.binding ?? 'image')}" style="${style}"></div>`
  }

  // QR. Emitted as inline SVG by our own runtime, which is why it stays vector
  // and crisp at A3 despite DEC-009's no-SVG-upload rule — that rule is about
  // UPLOADED files. Generated markup from our own code is a different thing.
  // The matrix itself arrives with STORY-DSG-011; until then the layer carries
  // its target and its quiet zone so the geometry is already correct.
  const target = resolveRef(ctx, l.qr.binding)
  const unbound = target === null ? ' dr-placeholder' : ''
  return (
    `<div class="dr-layer dr-qr${unbound}" data-layer="${esc(l.id)}" data-qr-target="${esc(target ?? '')}" ` +
    `data-qr-quiet="${l.qr.quietZoneModules ?? 4}" style="${style}"></div>`
  )
}

/** The canvas alone — no `<html>`, no `<head>`. The editor mounts this; the
 *  exporter wraps it. One function, so they cannot diverge. */
export function renderDocumentToFragment(doc: DesignDocument, opts: RenderOptions): { css: string; html: string } {
  const ctx = opts.bindings ?? EMPTY_BINDINGS
  const { width, height } = doc.master
  const bg = resolveColour(ctx, doc.background?.color, '#ffffff')

  const html =
    `<div class="dr-root" dir="${doc.direction}" style="width:${width}px;height:${height}px;background:${bg}">\n` +
    doc.layers
      .slice()
      // `hidden` is honoured HERE rather than by the editor, so an export can
      // never ship a layer the editor was hiding (REQ-DSG-024's other half).
      .filter((l) => !l.hidden)
      .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
      .map((l) => renderLayer(l, ctx))
      .join('\n') +
    `\n</div>`

  return { css: `${fontFaceCss(opts.fonts)}\n${BASE_CSS}\n${opts.extraCss ?? ''}`, html }
}

/** Renders a document to a standalone HTML string. */
export function renderDocumentToHtml(doc: DesignDocument, opts: RenderOptions): string {
  const { css, html } = renderDocumentToFragment(doc, opts)
  const bg = resolveColour(opts.bindings ?? EMPTY_BINDINGS, doc.background?.color, '#ffffff')

  return `<!doctype html><html dir="${doc.direction}" lang="${doc.direction === 'rtl' ? 'ar' : 'en'}">
<head><meta charset="utf-8"><style>
${css}
</style></head>
<body style="margin:0;background:${bg}">
${html}
</body></html>`
}
