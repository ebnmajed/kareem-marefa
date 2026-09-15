"use server";

import { revalidatePath } from "next/cache";
import { BRAND_COLOUR_TOKENS } from "@kareem/designer-runtime";
import type { Locale } from "@/i18n/routing";
import { saveBrandKit, resetBrandKit } from "@/lib/brand/kit";
import { saveBrandKitInput } from "@/lib/brand/schema";
import { signDesignAssetUrl } from "@/lib/dal/posters";

// SCR-059's two Server Actions — REQ-DSG-021, REQ-ADM-015. Zod first
// (`saveBrandKitInput`), then the DAL; `save_brand_kit()`'s own
// `assert_fresh_admin()` is the real gate regardless of what either
// validates (DEC-014) — a member or moderator reaches Postgres and is
// refused `42501`, mapped to the generic `notAdmin` copy here rather than
// re-implemented.
//
// The form's colour inputs are fully CONTROLLED (`BrandKitForm` holds them
// in `useState` for the live preview) rather than reading `defaultValue`
// back off this action's return, which is the usual fix for "React 19
// resets a form once its action resolves" (`propose/actions.ts`). A
// controlled input's DOM value is re-asserted by React on every render, so
// the native reset a failed action would otherwise cause is never visible —
// nothing the admin typed is lost, by construction rather than by echo.

export type SaveBrandKitState = { error: string | null; saved: boolean };

function readColourSet(formData: FormData, scheme: "light" | "dark"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of BRAND_COLOUR_TOKENS) out[token] = formData.get(`${scheme}[${token}]`)?.toString() ?? "";
  return out;
}

export async function saveBrandKitAction(locale: Locale, _prev: SaveBrandKitState, formData: FormData): Promise<SaveBrandKitState> {
  const nullableId = (name: string) => {
    const v = formData.get(name)?.toString();
    return v ? v : null;
  };

  const parsed = saveBrandKitInput.safeParse({
    light: readColourSet(formData, "light"),
    dark: readColourSet(formData, "dark"),
    logoAssetId: nullableId("logoAssetId"),
    headingFontId: nullableId("headingFontId"),
    bodyFontId: nullableId("bodyFontId"),
  });
  if (!parsed.success) return { error: "invalid", saved: false };

  try {
    await saveBrandKit(locale, parsed.data);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "42501") return { error: "notAdmin", saved: false };
    if (code === "22023") return { error: "badReference", saved: false };
    return { error: "unknown", saved: false };
  }

  revalidatePath(`/${locale}/app/admin/branding`);
  return { error: null, saved: true };
}

export type ResetBrandKitState = { error: string | null; reset: boolean };

export async function resetBrandKitAction(locale: Locale, _prev: ResetBrandKitState, _formData: FormData): Promise<ResetBrandKitState> {
  try {
    await resetBrandKit(locale);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return { error: code === "42501" ? "notAdmin" : "unknown", reset: false };
  }
  revalidatePath(`/${locale}/app/admin/branding`);
  return { error: null, reset: true };
}

/** A signed preview URL for a just-uploaded (or the currently saved) logo —
 *  `design_assets` has no public read, so the widget cannot build one
 *  itself (`signDesignAssetUrl`, `designer`'s `lib/dal/posters.ts`). Not a
 *  form action: called directly from client code right after the upload's
 *  complete step returns an `assetId`. */
export async function signLogoPreview(locale: Locale, assetId: string): Promise<string | null> {
  return signDesignAssetUrl(locale, assetId);
}
