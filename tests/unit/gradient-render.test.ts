// DEC-127 — the poster background is a gradient, not a flat fill. Two
// silent traps were held open on purpose in contract 1 (`391150e`):
// render.ts's two `background?.color` reads only understood `type: 'solid'`,
// so a gradient document fell back to '#ffffff' with no error; bindings.ts's
// collector walked the same single `.color`, so a gradient's stops'
// `{{brand.*}}` tokens were never counted — a rebrand never reached them.
// These tests are written red first against that held-open state and turn
// green with this file's paired fix in render.ts/bindings.ts.
import { describe, expect, it } from "vitest";
import {
  backgroundCss,
  declaredBindingsOf,
  EMPTY_BINDINGS,
  platformBrand,
  renderDocumentToFragment,
  renderDocumentToHtml,
  type DesignDocument,
} from "@kareem/designer-runtime";

const gradientDoc = (over: Partial<DesignDocument> = {}): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  background: {
    type: "gradient",
    angle: 140,
    stops: [{ color: "{{brand.surface}}" }, { color: "{{brand.canvasRaise}}" }],
  },
  layers: [],
  ...over,
});

describe("DEC-127 — a gradient document renders its gradient, not the solid fallback", () => {
  it("★ must not render on #ffffff — the trap render.ts held open", () => {
    const { html } = renderDocumentToFragment(gradientDoc(), { fonts: [], bindings: { values: platformBrand("dark") } });
    const surface = platformBrand("dark")["brand.surface"];
    const canvasRaise = platformBrand("dark")["brand.canvasRaise"];
    expect(html).toContain(`linear-gradient(140deg, ${surface}, ${canvasRaise})`);
    expect(html).not.toContain("background:#ffffff");
  });

  it("resolves each stop's token independently — a light-scheme render differs from dark", () => {
    const light = renderDocumentToFragment(gradientDoc(), { fonts: [], bindings: { values: platformBrand("light") } }).html;
    const dark = renderDocumentToFragment(gradientDoc(), { fonts: [], bindings: { values: platformBrand("dark") } }).html;
    expect(light).not.toEqual(dark);
  });

  it("a stop's explicit `at` — a FRACTION, 0…1 (the model's own unit, `validate.ts`) — is carried into the CSS as a percentage", () => {
    const { html } = renderDocumentToFragment(
      gradientDoc({
        background: {
          type: "gradient",
          angle: 90,
          stops: [
            { color: "{{brand.surface}}", at: 0.1 },
            { color: "{{brand.canvasRaise}}", at: 0.9 },
          ],
        },
      }),
      { fonts: [], bindings: { values: platformBrand("dark") } },
    );
    const surface = platformBrand("dark")["brand.surface"];
    const canvasRaise = platformBrand("dark")["brand.canvasRaise"];
    expect(html).toContain(`linear-gradient(90deg, ${surface} 10%, ${canvasRaise} 90%)`);
  });

  it("★ unit case: at 0.4 → 40%", () => {
    const doc = gradientDoc({ background: { type: "gradient", angle: 0, stops: [{ color: "#111111", at: 0.4 }] } });
    expect(backgroundCss(doc, EMPTY_BINDINGS)).toBe("linear-gradient(0deg, #111111 40%)");
  });

  it("rounds `at` to at most two decimals, so the CSS string — and the fingerprint — is stable", () => {
    const doc = gradientDoc({ background: { type: "gradient", angle: 0, stops: [{ color: "#111111", at: 1 / 3 }] } });
    expect(backgroundCss(doc, EMPTY_BINDINGS)).toBe("linear-gradient(0deg, #111111 33.33%)");
  });

  it("mirrors the angle for an LTR document — 360 − angle — and never for RTL, in BOTH render paths", () => {
    const rtlFragment = renderDocumentToFragment(gradientDoc({ direction: "rtl" }), { fonts: [], bindings: { values: platformBrand("dark") } }).html;
    const ltrFragment = renderDocumentToFragment(gradientDoc({ direction: "ltr" }), { fonts: [], bindings: { values: platformBrand("dark") } }).html;
    expect(rtlFragment).toContain("linear-gradient(140deg,");
    expect(ltrFragment).toContain("linear-gradient(220deg,");

    const rtlHtml = renderDocumentToHtml(gradientDoc({ direction: "rtl" }), { fonts: [], bindings: { values: platformBrand("dark") } });
    const ltrHtml = renderDocumentToHtml(gradientDoc({ direction: "ltr" }), { fonts: [], bindings: { values: platformBrand("dark") } });
    expect(rtlHtml).toContain("linear-gradient(140deg,");
    expect(ltrHtml).toContain("linear-gradient(220deg,");
  });

  it("a solid background is unaffected — the existing behaviour does not move", () => {
    const { html } = renderDocumentToFragment(
      {
        schemaVersion: 1,
        purpose: "poster",
        master: { width: 100, height: 100, unit: "px" },
        direction: "rtl",
        background: { type: "solid", color: "{{brand.canvas}}" },
        layers: [],
      },
      { fonts: [], bindings: { values: platformBrand("light") } },
    );
    expect(html).toContain(`background:${platformBrand("light")["brand.canvas"]}`);
  });

  it("an unbound stop falls back to #ffffff for that stop, same as a solid unbound colour", () => {
    const { html } = renderDocumentToFragment(gradientDoc(), { fonts: [] });
    expect(html).toContain("linear-gradient(140deg, #ffffff, #ffffff)");
  });
});

describe("DEC-127 — declaredBindingsOf collects every gradient stop", () => {
  it("★ collects both stops' tokens — the trap bindings.ts held open", () => {
    const found = declaredBindingsOf(gradientDoc());
    expect(found).toEqual(["brand.surface", "brand.canvasRaise"]);
  });

  it("a solid background still collects its one colour, unaffected", () => {
    const found = declaredBindingsOf({ layers: [], background: { type: "solid", color: "{{brand.canvas}}" } });
    expect(found).toEqual(["brand.canvas"]);
  });

  it("stops are collected in document order, alongside layer bindings, deduplicated", () => {
    const found = declaredBindingsOf({
      layers: [{ text: { binding: "session.title" } }],
      background: {
        type: "gradient",
        angle: 140,
        stops: [{ color: "{{brand.surface}}" }, { color: "{{brand.surface}}" }],
      },
    });
    expect(found).toEqual(["session.title", "brand.surface"]);
  });
});
