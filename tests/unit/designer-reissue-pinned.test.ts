// ★★ REQ-CRT-014, the half a database cannot prove — DEC-242 §4, REQ-DSG-013.
//
// `tests/rls/designer-baseline-supersede.test.ts` proves the certificate still
// RESOLVES its own version after the wave. This file proves the other half: that
// rendering that version is reproducible, and that when the platform palette
// moves the artifact CACHE cannot serve the old picture by mistake.
//
// The two claims are deliberately different, and the distinction is the whole
// file:
//
//   · THE DOCUMENT is byte-reproducible. Same pinned version, same brand, same
//     bindings → the same HTML, every time, on any machine. That is what makes a
//     reissue in 2031 the same certificate.
//   · THE COLOURS ARE NOT PINNED, and were never meant to be. A document binds
//     `{{brand.*}}`; the values arrive at render time from `brand_kit()`. So an
//     org on the platform default renders the OLD LAYOUT IN THE NEW PALETTE after
//     wave 24 — which is exactly DEC-176's sentence («an untouched document
//     renders identically, with the new values, because that is what moving a
//     default means») and exactly why `source_fingerprint` folds the resolved
//     bindings in: the key changes, so the new render is a NEW artifact row at a
//     new path and the file a member already downloaded is never overwritten.
//
// ★ The pre-wave document is read out of 0098's own SQL rather than retyped, the
// way `designer-library.test.ts` reads it — a hand-copied fixture would stop
// being the thing it claims to be the moment anyone edited it.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fingerprintSource, platformBrand, renderDocumentToHtml, resolveBrand, validateDocument, type DesignDocument } from "@kareem/designer-runtime";

/** ★ The ten platform defaults AS THEY STOOD AT 0191 — the palette a certificate
 *  issued before wave 24 was rendered with. A historical fixture, not a document
 *  literal: `0055`'s guard is about what a TEMPLATE carries, and this is what the
 *  brand kit used to hand it. DEC-242 §2's table is where these come from. */
const PALETTE_AT_0191: Record<string, string> = {
  "brand.canvas": "#ffffff",
  "brand.surface": "#ffffff",
  "brand.canvasRaise": "#f1f3f7",
  "brand.fgHeading": "#0b1220",
  "brand.fgBody": "#33415c",
  "brand.fgMuted": "#5b6780",
  "brand.edge": "#e6eaf0",
  "brand.spine": "#d7dce3",
  "brand.edgeStrong": "#767f8c",
  "brand.node": "#0b1220",
};

function seedBody(suffix: string, proposed?: string): string {
  if (proposed) {
    const file = join(process.cwd(), "supabase", "proposed", "designer", proposed);
    if (existsSync(file)) return readFileSync(file, "utf8");
  }
  const dir = join(process.cwd(), "supabase", "migrations");
  const found = readdirSync(dir).find((f) => f.endsWith(suffix));
  if (!found) throw new Error(`no migration ending ${suffix}`);
  return readFileSync(join(dir, found), "utf8");
}

/** Every `$json$…$json$` document in a seed, by its `-- @family` marker. */
function documentsOf(body: string): Map<string, DesignDocument> {
  const out = new Map<string, DesignDocument>();
  for (const m of body.matchAll(/--\s*@family\s+(\S+)((?:(?!--\s*@family)[\s\S])*?)\$json\$([\s\S]*?)\$json\$::jsonb/g)) {
    out.set(m[1] as string, JSON.parse(m[3] as string) as DesignDocument);
  }
  return out;
}

/** A certificate's bindings as `certificate_render_context()` hands them over —
 *  the frozen snapshot, the serial, the code and the absolute verify URL. */
const PINNED_BINDINGS: Record<string, string> = {
  "org.name": "شبه الجزيرة",
  "recipient.name": "محمّد بن عبد الله",
  "session.title": "جلسة عن Next.js 16",
  "certificate.serial": "2026-0001",
  "certificate.verificationCode": "k7m2qp9x",
  "certificate.verifyUrl": "https://example.test/ar/verify/k7m2qp9x",
  "certificate.issuedAt": "12 سبتمبر 2026",
};

const PRE_WAVE = documentsOf(seedBody("_certificate_library.sql", "0002_certificate_library.sql"));

/** The landscape attendance composition as it was issued against before wave 24.
 *  `0098` seeded it at version 2, which is the version a 2026 certificate pins. */
function preWaveCertificate(): DesignDocument {
  const doc = PRE_WAVE.get("attendance@landscape@v2");
  if (!doc) throw new Error("the pre-wave attendance@landscape document is not in the certificate-library seed");
  return doc;
}

const render = (doc: DesignDocument, values: Record<string, string>) => renderDocumentToHtml(doc, { fonts: [], bindings: { values } });
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

describe("REQ-CRT-014 — a certificate issued before the wave still renders as its own version", () => {
  it("★ the pinned document is still a valid document to this renderer", () => {
    // The first thing a reissue in 2031 needs: the OLD schema version is still
    // understood. `BASE_SCHEMA_VERSION` never moved, which is why.
    const parsed = validateDocument(preWaveCertificate());
    expect(parsed.ok, parsed.ok ? "" : parsed.issues.map((i) => `${i.path}:${i.code}`).join(", ")).toBe(true);
  });

  it("★★ rendering it twice at the same brand is BYTE-IDENTICAL — that is what «byte-reproducible» means", () => {
    const doc = preWaveCertificate();
    const brand = { ...resolveBrand({}, "light"), ...PINNED_BINDINGS };
    expect(digest(render(doc, brand))).toBe(digest(render(doc, brand)));
  });

  it("★★ it still carries its OWN layout — the wave's documents are a different thing entirely", async () => {
    const { BASELINE_LIBRARY } = await import("@kareem/designer-runtime");
    const old = preWaveCertificate();
    const now = BASELINE_LIBRARY.find((t) => t.purpose === "certificate" && t.orientation === "landscape" && t.family === "attendance")!.document;
    expect(JSON.stringify(old)).not.toBe(JSON.stringify(now));
    // The two things the rebuild changed that a reader would notice first.
    const face = (d: DesignDocument, id: string) => {
      const l = d.layers.find((x) => x.id === id);
      return l && "font" in l ? `${l.font.family}/${l.font.weight ?? 400}` : null;
    };
    expect(face(old, "l_recipient")).toBe("Amiri/600");
    expect(face(now, "l_recipient")).toBe("Baloo Bhaijaan 2/800");
    // And the old one still renders its own face, not the new one.
    expect(render(old, { ...resolveBrand({}, "light"), ...PINNED_BINDINGS })).toContain("Amiri");
  });

  it("★★ the palette is NOT pinned, and the fingerprint is what makes that safe — REQ-DSG-013", () => {
    const doc = preWaveCertificate();
    const was = { ...PALETTE_AT_0191, ...PINNED_BINDINGS };
    const now = { ...resolveBrand({}, "light"), ...PINNED_BINDINGS };

    // The same document under the two palettes renders DIFFERENT bytes — the old
    // layout in the new colours, which is what moving a default means.
    expect(digest(render(doc, was))).not.toBe(digest(render(doc, now)));

    // ★ And therefore a different CACHE KEY. `export_artifacts` is
    // `unique (document_id, preset, format, source_fingerprint)`, so the new
    // render is a new row at a new path: the PDF a member already holds is never
    // overwritten, and no stale artifact can be served as the current one.
    const key = (values: Record<string, string>) =>
      digest(fingerprintSource({ document: doc, templateVersionId: "11111111-1111-1111-1111-111111111111", bindings: values, fontHashes: ["aa", "bb"] }));
    expect(key(was)).not.toBe(key(now));

    // Same palette, same key — the invalidation is driven by the input and by
    // nothing else, so an untouched document re-renders not at all.
    expect(key(now)).toBe(key(now));
  });

  it("★ the brand kit of an org that overrode it is unaffected by the platform default moving", () => {
    // DEC-242 §4's last sentence, and contract 6: a template never hard-codes the
    // platform's own values, so an org with its own kit sees NOTHING change.
    const overridden = { light: { canvas: "#101010", fgHeading: "#fafafa", fgBody: "#fafafa", fgMuted: "#9a9a9a", node: "#00d1b2" } } as const;
    const resolved = resolveBrand(overridden, "light");
    expect(resolved["brand.canvas"]).toBe("#101010");
    expect(resolved["brand.node"]).toBe("#00d1b2");
    // The tokens it did NOT override fall through to the platform default, which
    // is the identity-override behaviour DEC-052 named.
    expect(resolved["brand.surface"]).toBe(platformBrand("light")["brand.surface"]);
  });
});
