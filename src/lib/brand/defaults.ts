// Fills any BRAND_COLOUR_TOKENS key a `brand_kit()` RPC result did not
// return — the per-token identity override, applied APP-SIDE as defence in
// depth (wave-8 sync, the lead). `getBrandKit()`'s Zod schema (`brandKit`,
// via `brandColourSet`) requires every current token, and the runtime's
// token list can grow (DEC-127 just added `canvasRaise`) faster than a
// migration promotes — so a stale RPC result missing a newer token must
// still parse into a complete, valid kit rather than throw a ZodError.
// Once the SQL carries every token this is a no-op; it stays afterwards as
// the same defence `0068`'s own header note already relies on for the
// no-row case ("the platform default IS the identity override").
//
// No `server-only` here (like schema.ts and contrast.ts): pure, no
// Supabase, safe to unit test directly.
import { BRAND_COLOUR_TOKENS, platformBrand, type BrandColourToken, type BrandScheme } from "@kareem/designer-runtime";

/** `raw` is whatever `brand_kit()` returned for one scheme — possibly
 *  missing a token the RPC predates. Every `BRAND_COLOUR_TOKENS` entry
 *  comes back set, filled from `platformBrand(scheme)` where `raw` did not
 *  carry it. */
export function fillBrandDefaults(
  raw: Partial<Record<BrandColourToken, string>>,
  scheme: BrandScheme,
): Record<BrandColourToken, string> {
  const defaults = platformBrand(scheme);
  const out = {} as Record<BrandColourToken, string>;
  for (const token of BRAND_COLOUR_TOKENS) {
    out[token] = raw[token] ?? (defaults[`brand.${token}`] as string);
  }
  return out;
}
