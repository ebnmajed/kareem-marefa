/**
 * The cache key — REQ-DSG-013, 06 §6.3.
 *
 * `source_fingerprint` = a hash of (document JSON + template version + bound
 * data + font hashes), and `unique (document_id, preset, format,
 * source_fingerprint)` is what makes invalidation impossible to forget: a
 * changed source produces a different KEY rather than requiring someone to
 * remember to clear a cache. Re-opening a session re-renders nothing; a
 * template version bump invalidates exactly the artifacts bound to it.
 *
 * THE PRESET AND THE FORMAT ARE NOT IN IT. They are their own columns in that
 * unique key, so folding them in here would give one source seven different
 * fingerprints and make "has this source already been rendered?" a question
 * with seven answers. The fingerprint describes the SOURCE; the key
 * describes the artifact.
 *
 * THIS MODULE PRODUCES THE STRING, NOT THE HASH. Canonicalisation is the part
 * that drifts — whether the keys were sorted, whether an absent field and an
 * empty one agree, whether the font list was ordered — and it has to be
 * identical in the app that looks the artifact up and the worker that writes
 * it. Hashing is one line of `node:crypto` in each, and both callers are
 * Node. Keeping the hash out is what keeps this package dependency-free, so
 * the worker image and the parity harness can import it unchanged.
 */

import type { DesignDocument } from './model.js'

export interface FingerprintSource {
  document: DesignDocument
  /** Null for a document that binds no template — an uploaded poster. */
  templateVersionId: string | null
  /** The resolved bindings, exactly as the render will see them. A changed
   *  session title is a changed poster, and this is where that is noticed. */
  bindings: Readonly<Record<string, string | undefined>>
  /** Every face the render may load, by SHA-256. Sorted here, not by the
   *  caller: two callers listing the same faces in a different order must
   *  produce the same key, or every render re-runs. */
  fontHashes: readonly string[]
}

/** JSON with object keys sorted at every depth. `JSON.stringify` preserves
 *  insertion order, so two documents identical in content but built in a
 *  different order would otherwise fingerprint differently and re-render
 *  forever. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    // An absent key and a key set to undefined mean the same thing to the
    // renderer, so they must mean the same thing here too.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

/**
 * The exact bytes to hash. Versioned: bumping `v1` is how a deliberate
 * global re-render is distinguished from an accidental one, the same trick
 * the points ledger's idempotency epoch uses (DEC-016).
 */
export function fingerprintSource(source: FingerprintSource): string {
  return canonical({
    v: 1,
    templateVersionId: source.templateVersionId,
    document: source.document,
    bindings: source.bindings,
    fonts: [...source.fontHashes].sort(),
  })
}
