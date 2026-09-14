/**
 * Dynamic fields — 06 §2.3, REQ-DSG-006.
 *
 * A binding names a value the document does not carry: the session's title,
 * the recipient's frozen name, a brand token. Two spellings exist in the
 * document model and both are accepted, because 06 §2.1 uses both: a bare
 * path in a text layer (`session.title`) and a moustache in a colour field
 * (`{{brand.canvas}}`). They mean the same thing.
 *
 * THE RULE THIS FILE EXISTS FOR: an unbound field renders as a clearly marked
 * placeholder, never as an empty box (REQ-DSG-006). An empty box exports as a
 * blank space nobody notices until it is printed — and the editor previews
 * with real data precisely so that the blank is seen while it can still be
 * fixed.
 */

/** The five namespaces a binding may name. Anything else is unbound. */
export const BINDING_NAMESPACES = ['brand', 'session', 'recipient', 'certificate', 'org'] as const
export type BindingNamespace = (typeof BINDING_NAMESPACES)[number]

/** `{{brand.canvas}}` and `brand.canvas` are the same binding. */
export function normaliseBinding(raw: string): string {
  const trimmed = raw.trim()
  const inner = /^\{\{(.+)\}\}$/.exec(trimmed)
  return (inner?.[1] ?? trimmed).trim()
}

/** Whether a string is a binding at all, as opposed to a literal colour or a
 *  piece of text that happens to contain a dot. */
export function isBinding(raw: string): boolean {
  const path = normaliseBinding(raw)
  const ns = path.split('.')[0] ?? ''
  return (BINDING_NAMESPACES as readonly string[]).includes(ns) && path.length > ns.length + 1
}

export interface BindingContext {
  /** Resolved values, keyed by the normalised binding path. A key present with
   *  an empty string is still unbound: a certificate with an empty recipient
   *  name is a defect, not a design. */
  values: Readonly<Record<string, string | undefined>>
  /** How a missing value is labelled on the canvas. The editor passes a
   *  translated formatter; the default names the binding, because a
   *  placeholder that does not say WHAT is missing sends the admin hunting. */
  placeholderLabel?: (binding: string) => string
}

export const EMPTY_BINDINGS: BindingContext = { values: {} }

export function defaultPlaceholderLabel(binding: string): string {
  return `‹ ${binding} ›`
}

export type ResolvedText =
  | { bound: true; text: string }
  /** `text` is what to DRAW; `binding` is what is missing. */
  | { bound: false; text: string; binding: string }

/**
 * Resolve a text or dynamic-field layer's content.
 *
 * Order: a literal wins (it is not a binding at all), then the bound value,
 * then the template's own fallback, then the marked placeholder. The fallback
 * is a template author's choice of sensible default text — «عنوان الجلسة» on
 * the title layer — and it is NOT a placeholder: it is real text the author
 * meant to ship if nothing binds.
 */
export function resolveText(
  ctx: BindingContext,
  spec: { binding?: string; literal?: string; fallback?: string },
): ResolvedText {
  if (spec.literal !== undefined && spec.literal !== '') return { bound: true, text: spec.literal }

  if (spec.binding) {
    const path = normaliseBinding(spec.binding)
    const value = ctx.values[path]
    if (value !== undefined && value !== '') return { bound: true, text: value }
    if (spec.fallback !== undefined && spec.fallback !== '') return { bound: true, text: spec.fallback }
    return { bound: false, binding: path, text: (ctx.placeholderLabel ?? defaultPlaceholderLabel)(path) }
  }

  if (spec.fallback !== undefined && spec.fallback !== '') return { bound: true, text: spec.fallback }
  return { bound: false, binding: '—', text: (ctx.placeholderLabel ?? defaultPlaceholderLabel)('—') }
}

/**
 * Resolve a colour. Unlike text, an unresolved colour has no safe placeholder:
 * drawing a dashed box where a fill should be would be worse than the
 * fallback. So it falls back, and the TEMPLATE GUARD in the database is what
 * stops a hex literal being committed in the first place (REQ-DSG-021).
 */
export function resolveColour(ctx: BindingContext, value: string | undefined, fallback: string): string {
  if (!value) return fallback
  if (!isBinding(value)) return value
  return ctx.values[normaliseBinding(value)] ?? fallback
}

/** Resolve a URL or an asset id — an image source, a QR target. Unbound is
 *  null, and the caller draws the placeholder. */
export function resolveRef(ctx: BindingContext, value: string | undefined): string | null {
  if (!value) return null
  if (!isBinding(value)) return value
  return ctx.values[normaliseBinding(value)] ?? null
}
