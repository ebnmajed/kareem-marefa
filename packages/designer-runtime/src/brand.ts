/**
 * The `{{brand.*}}` token contract — 06 §8.3, DEC-008, REQ-DSG-021.
 *
 * One source of truth, four consumers: the CSS `@theme`, the org brand kit,
 * designer templates, and email templates. A template never carries a hex
 * literal; it carries a token, and the token is resolved at render time. That
 * is what makes "change a colour in one place" true rather than aspirational —
 * and the database refuses a hex literal in a template version, so it stays
 * true after the fifth person edits a template.
 *
 * **This file is the CONTRACT and the platform default, not the org override.**
 * Wave 4's `branding` track supplies the per-org kit through `src/lib/brand/**`
 * (DEC-048 decision 2); until then every org resolves to the platform theme.
 * The values below are `src/app/globals.css`'s `:root` and `.theme-dark`
 * blocks, transcribed — when one changes, this changes with it, and
 * `tests/unit/designer-brand.test.ts` is what notices.
 */

/** Every token a template may bind. A binding outside this list is unbound,
 *  and an unbound field renders as a marked placeholder (REQ-DSG-006). */
export const BRAND_COLOUR_TOKENS = [
  'canvas',
  'surface',
  'fgHeading',
  'fgBody',
  'fgMuted',
  'edge',
  'edgeStrong',
  'spine',
  'node',
  /** DEC-127 — the second stop of the poster's gradient background. Not
   *  `brand.surface` again: the canvas paints `linear-gradient(140deg,
   *  #111a2c, #1d2a42)`, and `#1d2a42` (`--color-navy-800`) is not any
   *  existing token — writing it as a literal would put a navy past
   *  `0055`'s guard and hand an org that rebrands a gradient whose far end
   *  is somebody else's colour. Added here, at the end, so no existing
   *  binding's position in the array shifts (add-only). */
  'canvasRaise',
] as const

export type BrandColourToken = (typeof BRAND_COLOUR_TOKENS)[number]

/** Not a colour: the org logo is an image layer bound to an ASSET ID, never an
 *  asset each template embeds — which is why replacing the logo updates every
 *  template at once (06 §8.3). Raster only (DEC-009). */
export const BRAND_ASSET_TOKENS = ['logoAssetId'] as const

export type BrandScheme = 'light' | 'dark'

const LIGHT: Record<BrandColourToken, string> = {
  canvas: '#ffffff',
  surface: '#ffffff',
  fgHeading: '#0b1220',
  fgBody: '#33415c',
  fgMuted: '#5b6780',
  edge: '#e6eaf0',
  edgeStrong: '#767f8c',
  spine: '#d7dce3',
  node: '#0b1220',
  // DEC-127. Not painted anywhere today — the poster gradient is the first
  // consumer — chosen to sit visibly above `surface` (`#ffffff`) the same
  // way the dark value sits visibly above dark `surface` (`#111a2c`).
  canvasRaise: '#f1f3f7',
}

const DARK: Record<BrandColourToken, string> = {
  canvas: '#0b1220',
  surface: '#111a2c',
  fgHeading: '#ffffff',
  fgBody: '#c9ced6',
  fgMuted: '#a8b3c4',
  // globals.css writes these two as rgba() over the silver; a poster is
  // composited on an opaque canvas, so the flattened value is used here —
  // an export has no page behind it to blend with.
  edge: '#252e3d',
  edgeStrong: '#4b5464',
  spine: '#252e3d',
  node: '#ffffff',
  // DEC-127 — `--color-navy-800` (globals.css), the second stop of the
  // canvas's `linear-gradient(140deg, #111a2c, #1d2a42)`.
  canvasRaise: '#1d2a42',
}

/** The platform brand as `brand.*` binding values. Every template family ships
 *  in a light and a dark variant (06 §3.3), and the variant is the SCHEME —
 *  not a second template.
 *
 *  `scheme` is required, not defaulted (wave 8, DEC-125/127): every call
 *  site in the tree already passed one explicitly, and a default that
 *  silently means `'light'` is exactly how two worker call sites carried
 *  the wrong scheme for a poster and a certificate until DEC-125/128 wrote
 *  the right one down. Making the compiler ask is cheaper than a golden
 *  diff finding it again. */
export function platformBrand(scheme: BrandScheme): Record<string, string> {
  const palette = scheme === 'dark' ? DARK : LIGHT
  const out: Record<string, string> = {}
  for (const token of BRAND_COLOUR_TOKENS) out[`brand.${token}`] = palette[token]
  return out
}

/**
 * `resolveBrand()` — wave 4's `branding` track (DEC-052), added under this
 * file's own add-only rule: the exports above and the platform default
 * values do not change.
 *
 * The org override, as `supabase/proposed/branding/0001_brand_kits.sql`'s
 * `export_render_context()` amendment hands it to the render worker: a
 * RAW override (a full light set, a full dark set, or neither — a brand
 * kit is always saved whole, never a partial scheme), never pre-merged.
 * The merge happens exactly once, here, which is what keeps the platform
 * default in ONE place rather than two SQL functions and this file each
 * carrying their own copy of it.
 *
 * `{}` — no row, i.e. every org before it first visits SCR-059 — resolves
 * to exactly `platformBrand(scheme)`: the identity override 06 §8.3 and
 * DEC-052 both name, and the reason the parity goldens do not move this
 * wave.
 */
export interface BrandOverrides {
  light?: Partial<Record<BrandColourToken, string>>
  dark?: Partial<Record<BrandColourToken, string>>
  logoAssetId?: string | null
}

export function resolveBrand(
  overrides: BrandOverrides | null | undefined,
  scheme: BrandScheme,
): Record<string, string> {
  const out = platformBrand(scheme)
  const schemeOverride = scheme === 'dark' ? overrides?.dark : overrides?.light
  if (schemeOverride) {
    for (const token of BRAND_COLOUR_TOKENS) {
      const value = schemeOverride[token]
      if (value) out[`brand.${token}`] = value
    }
  }
  if (overrides?.logoAssetId) out['brand.logoAssetId'] = overrides.logoAssetId
  return out
}
