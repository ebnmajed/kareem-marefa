// The org logo — wave 4's `branding` track (DEC-052, 06 §8.3, REQ-DSG-021).
//
// A logo is a `design_assets` row (02 §4.13's `brand_kits.logo_asset_id`
// references it), and `design_assets` already has a bucket and a shape:
// `design-assets/{org_id}/design/assets/{asset_id}.{ext}` — raster only
// (DEC-009), built by `designAssetPath()` in ./designer.js. This file does
// NOT invent a second shape for the same bytes; it names the one that
// exists for the branding call site, so the logo upload Route Handler
// reads "the brand logo path" rather than reaching past its own track into
// `designer`'s file to reuse a poster/certificate asset helper.
import { designAssetPath } from './designer.js'
import type { StorageLocation } from './guards.js'

/** `design-assets/{org_id}/design/assets/{asset_id}.{ext}` for the org's
 *  brand-kit logo specifically — same shape as any other design asset. */
export function brandLogoPath(orgId: string, assetId: string, ext: 'png' | 'jpg' | 'webp'): StorageLocation {
  return { bucket: 'design-assets', path: designAssetPath(orgId, assetId, ext) }
}
