import { z } from "zod";
import { BRAND_COLOUR_TOKENS, type BrandColourToken } from "@kareem/designer-runtime";

// The Zod shape for the org brand kit — DEC-008, REQ-DSG-021, 06 §8.3, 02
// §4.13 (ENT-brand_kits, amended under DEC-052). One definition, shared by
// the save action's validation and the screen's own type source, so a field
// added to the token list cannot drift between the two the way a hand-kept
// interface would.
//
// No `server-only` here (unlike kit.ts): this module touches no Supabase
// client and the live-preview component needs `BRAND_COLOUR_TOKENS` and the
// contrast maths client-side too. `kit.ts` is the DAL boundary.

/** `#rrggbb` — the CHECK constraint `brand_kits` itself carries (DEC-052).
 *  Three-digit shorthand and alpha channels are refused: a template binds
 *  this value directly into an export, and neither shorthand nor alpha ever
 *  reaches print consistently. */
export const hexColour = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "hex_colour")
  .transform((v) => v.toLowerCase());

/** One colour per `BRAND_COLOUR_TOKENS` entry, built from the runtime's own
 *  list rather than retyped — the list this validates against and the list
 *  a template may bind are the same array (`packages/designer-runtime/src/brand.ts`). */
const colourSetShape = Object.fromEntries(BRAND_COLOUR_TOKENS.map((t) => [t, hexColour])) as Record<
  BrandColourToken,
  typeof hexColour
>;
export const brandColourSet = z.object(colourSetShape).strict();
export type BrandColourSet = z.infer<typeof brandColourSet>;

export const brandFontRef = z.object({
  id: z.string().uuid(),
  family: z.string().min(1),
  weight: z.number().int(),
  style: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
});
export type BrandFontRef = z.infer<typeof brandFontRef>;

export const brandLogo = z.object({
  assetId: z.string().uuid(),
  storagePath: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type BrandLogo = z.infer<typeof brandLogo>;

/** The full kit `getBrandKit()` returns — platform defaults filled in for
 *  whichever half of the org's row is unset, so a consumer never has to know
 *  whether an override exists (06 §8.3: the platform default IS the
 *  identity override). `isOverridden` says whether an org row exists at all,
 *  which is what SCR-059's reset action needs to decide its own visibility. */
export const brandKit = z.object({
  orgId: z.string().uuid(),
  isOverridden: z.boolean(),
  light: brandColourSet,
  dark: brandColourSet,
  logo: brandLogo.nullable(),
  headingFont: brandFontRef.nullable(),
  bodyFont: brandFontRef.nullable(),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().uuid().nullable(),
});
export type BrandKit = z.infer<typeof brandKit>;

/** What the save form submits — a full colour set for each scheme (SCR-059
 *  shows all nine at once, so a partial save is never meaningful), plus
 *  optional font and logo references. `logoAssetId` is set by the upload
 *  Route Handler completing first (`server-only`, REQ-DSG-018) — the save
 *  action never accepts raw bytes, only a reference to an already-sniffed
 *  `design_assets` row. */
export const saveBrandKitInput = z.object({
  light: brandColourSet,
  dark: brandColourSet,
  logoAssetId: z.string().uuid().nullable(),
  headingFontId: z.string().uuid().nullable(),
  bodyFontId: z.string().uuid().nullable(),
});
export type SaveBrandKitInput = z.infer<typeof saveBrandKitInput>;
