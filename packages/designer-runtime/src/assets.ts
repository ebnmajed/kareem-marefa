/**
 * Which design assets a document's images name — DEC-179.
 *
 * An image layer points at an asset by id, either directly (`image.assetId`)
 * or through a binding whose resolved value is an id (`{{brand.logoAssetId}}`,
 * which `resolveBrand()` fills with the brand kit's asset id). The worker and
 * the studio both need the same list to turn ids into something a browser can
 * load, so it is computed once, here, from the renderer's own resolution.
 *
 * A value that is already a URL (`https:`, `http:`, `data:` — a signed URL the
 * app pinned, or a test's fixture) is not an asset id and is left alone.
 */

import { resolveRef, type BindingContext } from './bindings.js'
import type { DesignDocument } from './model.js'

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every asset id the document's visible image layers resolve to, once each, in document order. */
export function assetIdsOf(doc: Pick<DesignDocument, 'layers'>, ctx: BindingContext): string[] {
  const out: string[] = []
  for (const layer of doc.layers) {
    if (layer.kind !== 'image' || layer.hidden) continue
    const ref = resolveRef(ctx, layer.image.assetId ?? layer.image.binding)
    if (ref && ASSET_ID.test(ref) && !out.includes(ref)) out.push(ref)
  }
  return out
}
