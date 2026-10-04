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
import { PLATFORM_LIGHT, SAMPLE_BRAND } from "@kareem/mail-runtime";
import { contrastRatio } from "@/lib/brand/contrast";

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

describe("★ the third copy of the platform palette equals the other two", () => {
  // ★ THE CASE THIS FILE WAS NAMED FOR. `render.ts`'s `PLATFORM_LIGHT` is what
  // a mail falls back to when the kit supplies nothing — no brand at all, a
  // half-filled kit, or the three-key shape the worker sent before wave 10.
  // Until wave 24 those were M6's navy written inline at ten call sites, which
  // `0192` replaced everywhere except here, so a mail rendered without a kit
  // looked like a product that no longer exists.
  //
  // It cannot be derived at run time: `@kareem/mail-runtime` must not import the
  // document renderer. So it is a literal held equal by a test, exactly as
  // `tests/rls/brand-kits.test.ts` holds `brand.ts` and `public.brand_kit()`
  // equal — and this is the copy that had nothing watching it.
  it("every token `render.ts` carries equals `platformBrand('light')`", () => {
    const defaults = platform("light");
    for (const [token, value] of Object.entries(PLATFORM_LIGHT)) {
      expect(value, `render.ts's PLATFORM_LIGHT.${token}`).toBe(defaults[token]);
    }
  });

  it("carries only real brand tokens — a typo cannot hide as an unchecked key", () => {
    // Without this, `PLATFORM_LIGHT.fgheading` would pass the case above by
    // never being compared to anything.
    for (const token of Object.keys(PLATFORM_LIGHT)) {
      expect(BRAND_COLOUR_TOKENS, token).toContain(token);
    }
  });

  it("★ the sample kit and the platform default still differ on every token they share", () => {
    // The two halves of this file meet here: if they ever agreed, `.brand.html`
    // and `.plain.html` would be byte-identical and 60 pinned files would stop
    // proving that a brand is read at all.
    const kit = SAMPLE_BRAND.light as Record<string, string>;
    for (const token of Object.keys(PLATFORM_LIGHT)) {
      expect(kit[token], token).not.toBe(PLATFORM_LIGHT[token as keyof typeof PLATFORM_LIGHT]);
    }
  });
});

describe("★ the accent pair — the measurement that made commit 3 one commit", () => {
  // ★ WHY THIS IS A TEST AND NOT ONLY A COMMIT MESSAGE.
  //
  // `compilePalette().accent` was `fgHeading` and the primary button's label was
  // a hard-coded white: a dark slab with white text, which is why no sent mail
  // ever carried the product's accent. `DEC-242` §2 makes the accent `node`, and
  // the label had to move in the SAME commit — because white on the new accent
  // is below AA. A commit body records that once; this holds it.
  //
  // `contrastRatio()` is `src/lib/brand/contrast.ts`'s, the function
  // `save_brand_kit()`'s own guard is built on, so this asks the same question
  // the database asks of a kit rather than a second implementation of it.
  const AA = 4.5;

  it("the heading colour on the accent clears AA — the pairing that shipped", () => {
    expect(contrastRatio(PLATFORM_LIGHT.fgHeading, PLATFORM_LIGHT.node)).toBeGreaterThanOrEqual(AA);
  });

  it("★ a white label on the accent does NOT — which is why the label moved with it", () => {
    // The defect this commit fixes, asserted as a defect. If a later change
    // makes white pass on the accent, the accent has drifted light enough to be
    // worth a second look rather than a silent pass.
    expect(contrastRatio("#ffffff", PLATFORM_LIGHT.node)).toBeLessThan(AA);
  });

  it("and the sample kit's own accent pairing clears AA too, so the pins show a legible button", () => {
    const kit = SAMPLE_BRAND.light;
    expect(contrastRatio(kit.fgHeading, kit.node)).toBeGreaterThanOrEqual(AA);
  });
});
