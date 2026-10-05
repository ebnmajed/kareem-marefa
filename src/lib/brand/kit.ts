import "server-only";
import { sessionClient } from "@/lib/dal/session";
import { brandKit, type BrandKit, type SaveBrandKitInput } from "./schema";
import { fillBrandDefaults } from "./defaults";

export type { BrandKit, BrandColourSet, BrandFontRef, BrandLogo, SaveBrandKitInput } from "./schema";
export { brandColourSet, brandKit, brandFontRef, brandLogo, hexColour, saveBrandKitInput } from "./schema";
export { checkContrast, contrastRatio, AA_THRESHOLD, type ContrastCheck, type ContrastUse } from "./contrast";
export { fillBrandDefaults } from "./defaults";

// The org brand kit, read side — DEC-008, REQ-DSG-021, 06 §8.3, 02 §4.13.
//
// `getBrandKit()` is published first (wave-4 sync 1, `docs/plan/notes/
// branding.md` §0.1) so the lead can wire the CSS `@theme` layer in
// `src/app/[locale]/app/layout.tsx` before SCR-059 exists at all — the
// platform default is the identity override (DEC-052), so this function
// returns a complete, valid kit whether or not the org has ever saved one.
//
// `(locale, orgId)` rather than `(orgId)` alone: every DAL function in this
// tree calls `requireSession(locale)` first, which needs the locale to build
// a sign-in redirect (`src/lib/dal/session.ts`) — matching that convention
// here rather than inventing a second one. `orgId` is shape, not authority
// (`CLAUDE.md` § Validation): `public.brand_kit()` is `security invoker`, so
// RLS still scopes the read to the caller's own org regardless of what is
// passed, and a brand kit carries no sensitive data if it did not.
export async function getBrandKit(locale: string, orgId: string): Promise<BrandKit> {
  const { supabase } = await sessionClient(locale);

  const { data, error } = await supabase.rpc("brand_kit", { p_org: orgId });
  if (error) throw error;

  const raw = data as {
    orgId: string;
    isOverridden: boolean;
    light: Record<string, string>;
    dark: Record<string, string>;
    logoAssetId: string | null;
    headingFontId: string | null;
    bodyFontId: string | null;
    updatedAt: string | null;
  };

  const [logo, headingFont, bodyFont] = await Promise.all([
    raw.logoAssetId ? fetchLogo(supabase, raw.logoAssetId) : Promise.resolve(null),
    raw.headingFontId ? fetchFont(supabase, raw.headingFontId) : Promise.resolve(null),
    raw.bodyFontId ? fetchFont(supabase, raw.bodyFontId) : Promise.resolve(null),
  ]);

  // One updated_by is enough for the screen; the RPC does not carry it
  // (it is not needed by the CSS/render/mail consumers), so it is left
  // null here rather than adding a fourth query for a value SCR-059 shows
  // once, if at all.
  //
  // `fillBrandDefaults` fills any BRAND_COLOUR_TOKENS key `brand_kit()` did
  // not return (the per-token identity override, applied here as defence
  // in depth — wave-8 sync, the lead): `canvasRaise` reaching
  // `BrandColourSet` before its SQL migration is promoted, or any future
  // token added the same way, must not turn a routine page view into a
  // ZodError.
  return brandKit.parse({
    orgId: raw.orgId,
    isOverridden: raw.isOverridden,
    light: fillBrandDefaults(raw.light, "light"),
    dark: fillBrandDefaults(raw.dark, "dark"),
    logo,
    headingFont,
    bodyFont,
    updatedAt: raw.updatedAt,
    updatedBy: null,
  });
}

async function fetchLogo(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  assetId: string,
): Promise<{ assetId: string; storagePath: string; width: number; height: number; mime: string | null; byteSize: number | null } | null> {
  // ★ wave 26: a FAILED read throws; only an ABSENT row is null. Degrading a failed read to «no logo» was not soft: SCR-059's
  // edit mode binds what this returns as the form's `logoAssetId`, so a transient error here followed by any save
  // would have unbound the org's logo, silently. The page's error boundary is the honest outcome; «no logo» is not.
  const { data, error } = await supabase.from("design_assets").select("id, storage_path, width, height, sniffed_mime, byte_size").eq("id", assetId).maybeSingle();
  if (error) throw error;
  if (!data || !data.width || !data.height) return null;
  return {
    assetId: data.id,
    storagePath: data.storage_path,
    width: data.width,
    height: data.height,
    mime: (data.sniffed_mime as string | null) ?? null,
    byteSize: data.byte_size === null || data.byte_size === undefined ? null : Number(data.byte_size),
  };
}

async function fetchFont(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  fontId: string,
): Promise<{ id: string; family: string; weight: number; style: string; sha256: string } | null> {
  // ★ wave 26: as `fetchLogo` — a failed read throws, so edit mode never posts «platform default» over a chosen face.
  const { data, error } = await supabase.from("fonts").select("id, family, weight, style, sha256").eq("id", fontId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data;
}

/**
 * The admin's write. `saveBrandKitInput` is validated by the caller (the
 * Server Action) before this runs — `CLAUDE.md` § Validation: shape here,
 * authority in `save_brand_kit()` (`assert_fresh_admin()` re-reads role and
 * `claims_version` fresh, DEC-014). A moderator or member reaches Postgres
 * and is refused `42501`; this function does not re-check the role.
 */
export async function saveBrandKit(locale: string, input: SaveBrandKitInput): Promise<{ updatedAt: string | null }> {
  const { supabase } = await sessionClient(locale);
  // ★ wave 26 (REQ-UIX-116, DEC-231 §3), add-only: `save_brand_kit()` returns the row it wrote, so the saved mark is
  // read from the server's answer — its `updated_at` — never from the client's clock.
  const { data, error } = await supabase.rpc("save_brand_kit", {
    p_light: input.light,
    p_dark: input.dark,
    p_logo_asset_id: input.logoAssetId,
    p_heading_font_id: input.headingFontId,
    p_body_font_id: input.bodyFontId,
  });
  if (error) throw error;
  return { updatedAt: (data as { updated_at?: string | null } | null)?.updated_at ?? null };
}

/** Deletes the org's row — "reset" is "no row" (06 §8.3), never a copy of
 *  the platform's own values written back into the org's kit. */
export async function resetBrandKit(locale: string): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("reset_brand_kit");
  if (error) throw error;
}

/**
 * `org_settings.limit_image_mb` — the same org-configurable ceiling
 * `photos`/`materials` already read before their own uploader — so
 * `ui/file-drop`'s advisory `maxBytes` on SCR-059's logo picker matches what
 * `initiateAssetUpload()` (`designer`'s `lib/dal/posters.ts`) will actually
 * enforce, rather than a number guessed into this screen. `20` is the same
 * fallback `posters.ts` itself falls back to when the org has never set one.
 */
export async function getImageLimitMb(locale: string): Promise<number> {
  const { session, supabase } = await sessionClient(locale);
  const { data } = await supabase.from("org_settings").select("limit_image_mb").eq("org_id", session.orgId).maybeSingle();
  return (data?.limit_image_mb as number | undefined) ?? 20;
}

/**
 * The org's own name — REQ-UIX-013: the reset dialog confirms by naming
 * the object, not "your organisation" generically. Kept separate from
 * `getBrandKit()`, whose shape is a published, four-consumer contract
 * (06 §8.3) that a screen-only display value has no reason to widen.
 */
export async function getOrgName(locale: string): Promise<string> {
  const { session, supabase } = await sessionClient(locale);
  const { data } = await supabase.from("orgs").select("name").eq("id", session.orgId).maybeSingle();
  return (data?.name as string | undefined) ?? "";
}
