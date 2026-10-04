// The renderer — REQ-DSG-006, REQ-DSG-016, REQ-DSG-021, REQ-DSG-024, A30.
//
// `scripts/parity/harness.mjs` proves this renderer shapes Arabic correctly
// in a real browser. These tests prove the things a browser cannot tell you:
// that an unbound field is MARKED, that a hidden layer never reaches an
// export, that a brand token resolves instead of being printed, and that a
// face is addressed by hash rather than by a CDN URL.
import { describe, expect, it } from "vitest";
import {
  ARABIC_UNICODE_RANGE,
  fontFaceCss,
  platformBrand,
  renderDocumentToFragment,
  renderDocumentToHtml,
  type DesignDocument,
} from "@kareem/designer-runtime";

const doc = (layers: DesignDocument["layers"]): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  background: { type: "solid", color: "{{brand.canvas}}" },
  layers,
});

const title = (over: Partial<DesignDocument["layers"][number]> = {}): DesignDocument["layers"][number] =>
  ({
    id: "l_title",
    kind: "text",
    frame: { x: 80, y: 300, w: 920, h: 320 },
    text: { binding: "session.title" },
    font: { family: "IBM Plex Sans Arabic", size: 96 },
    color: "{{brand.fgHeading}}",
    ...over,
  }) as DesignDocument["layers"][number];

describe("REQ-DSG-006 — an unbound field is a marked placeholder, never an empty box", () => {
  it("marks the layer and names the binding when nothing resolves", () => {
    const { html } = renderDocumentToFragment(doc([title()]), { fonts: [] });
    expect(html).toContain('data-placeholder="session.title"');
    expect(html).toContain("dr-placeholder");
    // And it draws SOMETHING: a blank exports as white space nobody notices
    // until it is printed.
    expect(html).toMatch(/<bdi>[^<]+<\/bdi>/);
  });

  it("draws the real value when it binds, with no placeholder marking", () => {
    const { html } = renderDocumentToFragment(doc([title()]), {
      fonts: [],
      bindings: { values: { "session.title": "كيف نقرأ لوغاريتمًا" } },
    });
    expect(html).toContain("كيف نقرأ لوغاريتمًا");
    expect(html).not.toContain("dr-placeholder");
  });

  it("a template's own fallback is real text, not a placeholder", () => {
    const { html } = renderDocumentToFragment(doc([title({ text: { binding: "session.title", fallback: "عنوان الجلسة" } } as never)]), { fonts: [] });
    expect(html).toContain("عنوان الجلسة");
    expect(html).not.toContain("dr-placeholder");
  });

  it("an unbound IMAGE is marked too — an org with no logo must see it on the canvas", () => {
    const { html } = renderDocumentToFragment(
      doc([{ id: "l_logo", kind: "image", frame: { x: 0, y: 0, w: 140, h: 140 }, image: { binding: "brand.logoAssetId" } }]),
      { fonts: [] },
    );
    expect(html).toContain('data-placeholder="brand.logoAssetId"');
  });
});

describe("REQ-DSG-021 — colours are tokens, resolved at render time", () => {
  it("resolves {{brand.*}} from the platform theme and never prints the token", () => {
    const { html } = renderDocumentToFragment(doc([title()]), { fonts: [], bindings: { values: platformBrand("light") } });
    expect(html).toContain("#0b1220");
    expect(html).not.toContain("{{brand.fgHeading}}");
  });

  it("the same document in the dark scheme is the same document — the variant is the SCHEME", () => {
    const light = renderDocumentToFragment(doc([title()]), { fonts: [], bindings: { values: platformBrand("light") } }).html;
    const dark = renderDocumentToFragment(doc([title()]), { fonts: [], bindings: { values: platformBrand("dark") } }).html;
    expect(light).not.toEqual(dark);
    expect(dark).toContain("#ffffff");
  });
});

describe("REQ-DSG-024 — a hidden layer never reaches an export", () => {
  it("drops it from the markup rather than trusting the editor not to draw it", () => {
    const { html } = renderDocumentToFragment(doc([title(), title({ id: "l_hidden", hidden: true } as never)]), { fonts: [] });
    expect(html).toContain('data-layer="l_title"');
    expect(html).not.toContain('data-layer="l_hidden"');
  });
});

describe("A30 — the typographic invariants are CSS, not advice", () => {
  it("never letter-spaces, never clips a line, never justifies", () => {
    const css = renderDocumentToFragment(doc([title()]), { fonts: [] }).css;
    expect(css).toContain("letter-spacing:0");
    expect(css).toContain("overflow:visible");
    // Comments stripped first: the base CSS EXPLAINS why overflow:hidden eats
    // stacked tashkeel, and the explanation must not read as a violation.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toContain("text-align:justify");
    expect(declarations).not.toMatch(/overflow\s*:\s*hidden/);
  });

  it("bidi-isolates every drawn value — REQ-INT-007", () => {
    const { html } = renderDocumentToFragment(doc([title()]), { fonts: [], bindings: { values: { "session.title": "جلسة عن Next.js 16" } } });
    expect(html).toContain("<bdi>جلسة عن Next.js 16</bdi>");
  });
});

describe("REQ-DSG-016 — a face is addressed by its bytes", () => {
  const face = { family: "IBM Plex Sans Arabic", weight: 400, style: "normal", sha256: "a".repeat(64) };

  it("★ declares the two subsets of a family PLAINLY, with no unicode-range", () => {
    // Measured, not reasoned. Ranging the Arabic subset alone makes Arabic
    // WORSE: the unranged Latin face still matches every character and still
    // wins, but the missing glyph then resolves to a SYSTEM font instead of
    // falling back to the Arabic face in the same family. «محمد» goes from
    // 88.05 to 76.02 — the system fallback's own width.
    const css = fontFaceCss([
      { ...face, url: "/api/fonts/latin" },
      { ...face, url: "/api/fonts/arabic" },
    ]);
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).not.toContain("unicode-range");
  });

  it("still EMITS a range when one is asked for — the mechanism stays, the policy changed", () => {
    expect(fontFaceCss([{ ...face, url: "/f", unicodeRange: ARABIC_UNICODE_RANGE }])).toContain("unicode-range:U+0600-06FF");
  });

  it("inlines bytes when given base64 and links by hash when given a url — same bytes, different transport", () => {
    expect(fontFaceCss([{ ...face, base64: "AAAA" }])).toContain("url(data:font/woff2;base64,AAAA)");
    expect(fontFaceCss([{ ...face, url: `/api/fonts/${face.sha256}` }])).toContain(`url('/api/fonts/${face.sha256}')`);
  });

  it("never emits a face with no source at all — a silently missing face is the D66 failure", () => {
    expect(fontFaceCss([face])).toBe("");
  });

  it("escapes a quote in a family name rather than closing the CSS string", () => {
    expect(fontFaceCss([{ ...face, family: "Ali's Kufi", url: "/f" }])).toContain("font-family:'Ali\\'s Kufi'");
  });
});

describe("the fragment and the document are the same canvas", () => {
  it("the standalone export embeds exactly what the editor mounts", () => {
    const options = { fonts: [], bindings: { values: { "session.title": "جلسة" } } };
    const { html } = renderDocumentToFragment(doc([title()]), options);
    expect(renderDocumentToHtml(doc([title()]), options)).toContain(html);
  });
});
