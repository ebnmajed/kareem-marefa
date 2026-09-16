/** REQ-DSC-004 — a JS port of `public.ar_normalize()` (0037), byte-for-byte the same
 *  transformation: strip tashkeel/tatweel, fold alef/yaa/taa-marbuta forms, collapse whitespace.
 *  Needed here because the free-text query has to be normalised the SAME way `search_vector`
 *  and `tags.normalised` already were at write time — matching "معرفات" against a stored
 *  "مُعرِّفات" only works if both sides go through the identical fold. */
export function arNormalize(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, "") // tashkeel (U+064B–U+0652) + dagger alef + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}
