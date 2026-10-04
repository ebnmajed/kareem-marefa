// ★ THE MAIL RENDERER IS THE THIRD COPY OF THE PLATFORM PALETTE — wave 24,
// `REQ-NTF-016`, `DEC-242` §2.
//
// The platform default lives in `packages/designer-runtime/src/brand.ts` and in
// `public.brand_kit()`'s `coalesce` fallbacks, and `tests/rls/brand-kits.test.ts`
// compares those two so they cannot drift. There is a THIRD copy nobody was
// watching: `packages/mail-runtime/src/render.ts` carries its own literals, and
// `0155` is what it looks like when a copy nobody watches is left behind — the
// Google CSP entry a decision retired and the code kept for three waves.
//
// So this file is `brand-kits.test.ts` for the mail renderer. It imports
// `@kareem/designer-runtime` IN A TEST ONLY: `@kareem/mail-runtime` must not
// depend on it — the worker's mail path has no business loading a document
// renderer — so the values stay literals in `render.ts` and this is what holds
// them equal.
import { describe, expect, it } from "vitest";
import { BRAND_COLOUR_TOKENS, platformBrand } from "@kareem/designer-runtime";
import { SAMPLE_BRAND } from "@kareem/mail-runtime";

/** The platform default's one scheme, by bare token name. */
const platform = (scheme: "light" | "dark"): Record<string, string> => {
  const prefixed = platformBrand(scheme);
  return Object.fromEntries(BRAND_COLOUR_TOKENS.map((token) => [token, prefixed[`brand.${token}`]!]));
};

describe("★ the sample kit is an org's own, never the platform's", () => {
  // ★ WHY THIS IS THE LOAD-BEARING CASE OF THE FILE.
  //
  // `samples.ts`'s original comment kept `SAMPLE_BRAND`'s three values off
  // `render.ts`'s fallbacks «so that a brand that stopped being read would fail
  // rather than quietly produce two identical files». Wave 24 makes those
  // fallbacks the platform default, which re-introduces that failure from the
  // inside unless the sample kit is an INVENTED palette: if it were the
  // platform's own values, `<id>.brand.html` and `<id>.plain.html` would become
  // byte-identical and 60 pinned files would stop proving anything about
  // whether a brand is read.
  it("carries the full kit, both schemes, every one of the ten tokens", () => {
    for (const scheme of ["light", "dark"] as const) {
      const kit = SAMPLE_BRAND[scheme] as Record<string, string>;
      for (const token of BRAND_COLOUR_TOKENS) {
        expect(kit[token], `${scheme}.${token}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("★ no value equals the platform default — the pin cannot pass by coincidence", () => {
    for (const scheme of ["light", "dark"] as const) {
      const kit = SAMPLE_BRAND[scheme] as Record<string, string>;
      const defaults = platform(scheme);
      for (const token of BRAND_COLOUR_TOKENS) {
        expect(kit[token], `${scheme}.${token} must differ from the platform default`).not.toBe(defaults[token]);
      }
    }
  });

  it("is the shape `compilePalette()` reads — `light` present, so no fallback is reached", () => {
    // `compilePalette()` tests `"light" in brand`. The legacy three-key shape
    // failed that test, which is why the pins recorded fallbacks for four
    // tokens instead of the kit.
    expect("light" in SAMPLE_BRAND).toBe(true);
  });
});
