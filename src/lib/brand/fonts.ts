import "server-only";
import { sessionClient } from "@/lib/dal/session";
import type { BrandFontRef } from "./schema";

// The two faces SCR-059's pickers offer — REQ-DSG-021, 06 §7.2, A39.
//
// A font becomes selectable ONLY at `parity_status = 'passed'`: a face with
// partial GSUB or mark coverage renders Latin perfectly and silently breaks
// lam-alef and stacked tashkeel, so a pending or failed row is never an
// option here even though `save_brand_kit()` would refuse it anyway (the
// screen should not offer a choice the RPC will reject).
//
// A SEPARATE query from `designer`'s `listEditorFaces()`
// (`src/lib/dal/fonts.ts`): that function returns the editor's face list by
// SHA-256 for canvas loading and falls back to the package manifest when the
// bucket is empty. This screen needs the fonts.ID `save_brand_kit()` takes
// as `p_heading_font_id`/`p_body_font_id` — a fallback to unmaterialised
// package faces would offer an id `brand_kits.heading_font_id`'s FK could
// never reference, so there is no fallback here: an empty list is shown as
// an empty list, honestly, rather than a choice that cannot be saved.
export async function listSelectableFonts(locale: string): Promise<BrandFontRef[]> {
  const { supabase } = await sessionClient(locale);
  const { data } = await supabase
    .from("fonts")
    .select("id, family, weight, style, sha256")
    .eq("parity_status", "passed")
    .order("family");
  return (data ?? []) as BrandFontRef[];
}
