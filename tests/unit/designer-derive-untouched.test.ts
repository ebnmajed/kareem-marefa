// ★ No golden moves — the unit-level proof (REQ-DSG-030's «an untouched document
// derives identically», DEC-176 §1, DEC-178's first condition on D2b).
//
// Every seeded baseline template, at every preset it exports, and an uploaded
// poster's document as `uploadedPosterDocument()` has written it since wave 3:
// `derive()`'s output and `renderDocumentToHtml()`'s HTML for it, hashed.
//
// A hash that changes here is a render that changes for a document nobody
// touched. That is a bug to report, never a hash to refresh — exactly as a moved
// parity golden is (REQ-DSG-015). The parity harness proves the pixels; this
// proves the input to them, for more documents than the harness has cases.
//
// ★★ WAVE 24 (M26, DEC-242) IS THE ONE CASE THAT RULE DOES NOT COVER, AND THIS
// IS THE REASONING RATHER THAN A SILENT REFRESH. The forty-one baseline hashes
// below were taken from `main`'s runtime at `46bbb15` until this wave, and the
// rule held because nobody had changed a baseline document since wave 3. Wave 24
// REPLACED ALL ELEVEN on purpose — `REQ-DSG-033` and `REQ-CRT-016` — so «a
// document nobody touched» is false of every one of them, and a hash that did
// NOT move would have been the bug. They are refreshed here, once, by the lead.
//
// ★ THE SEVEN `uploaded/*` HASHES ARE UNCHANGED, AND THAT IS THE POINT. An
// uploaded poster is not a baseline template and wave 24 did not touch it, so
// the rule still binds there in full. Those seven passing untouched across a
// wave that moved the other forty-one is the assertion that proves the seam:
// the rebuild reached the library and stopped there. If a later wave finds one
// of the seven moved, that is still a bug and still never a refresh.
//
// ★ Regenerated independently by the lead from this branch's built runtime and
// compared key-by-key against `designer`'s own table before being written here:
// 41 entries, identical keys, zero differing hashes.
//
// ★★ THE FORTY-ONE MOVED A SECOND TIME in wave 24, and the reason is the one
// `DEC-176` allows: a baseline document was rebuilt. The first move was the
// wave's rebuild; this one is its RE-COLOUR, after
// `docs/design/screens/m12/AdminDesignerElements.dc.html` turned out to be the
// poster artboard `DEC-242` §1 said did not exist. Every poster's ground, type
// and pill changed namespace and value, and the certificates gained the lockup
// and the signature label the certificate artboard draws. ★ The seven
// `uploaded/*` hashes did NOT move, again — which is the same seam holding, and
// the check worth reading first when this file next changes.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BASELINE_LIBRARY, derive, presetsFor, presetsForDocument, renderDocumentToHtml, type DesignDocument } from "@kareem/designer-runtime";

const BASELINE_HASHES: Record<string, string> = 
{
  "poster/talk///master": "a6bcaf240f654a5c",
  "poster/talk///square": "1d9c3ac8b98f8d4f",
  "poster/talk///story": "6f3a409f03825c5a",
  "poster/talk///landscape": "ac1a53795daed390",
  "poster/talk///og": "47c175ec040ff340",
  "poster/talk///a4": "def691b0871494a8",
  "poster/talk///a3": "f19a860e183ad516",
  "poster/workshop///master": "45b61d17abec58fb",
  "poster/workshop///square": "093fbe3fe49f2818",
  "poster/workshop///story": "f850117d6a9ac15b",
  "poster/workshop///landscape": "055468da307bf620",
  "poster/workshop///og": "db2930ca999c9442",
  "poster/workshop///a4": "61525e1d1a1a76c1",
  "poster/workshop///a3": "ed9a59286267dac6",
  "poster/panel///master": "86c18283734607ce",
  "poster/panel///square": "5ccd9ec3617c0416",
  "poster/panel///story": "71ba032a409d6bc3",
  "poster/panel///landscape": "6ee8647f484bf4f0",
  "poster/panel///og": "08f28d2244953675",
  "poster/panel///a4": "2ec6c29bcaf3d56c",
  "poster/panel///a3": "e9112f67d1761fa5",
  "poster/meetup///master": "875f6d139fb1fdfd",
  "poster/meetup///square": "812bf4dc6a6ba4e2",
  "poster/meetup///story": "0e9098b38a01a957",
  "poster/meetup///landscape": "d523d0548cc9cba5",
  "poster/meetup///og": "a0136af9bbe638d6",
  "poster/meetup///a4": "49fcde2a26a15a79",
  "poster/meetup///a3": "4a9d3549e629b946",
  "poster/announcement///master": "105c9f2ef1fa7af9",
  "poster/announcement///square": "f683c2c0c5d303a1",
  "poster/announcement///story": "6415aaf24e661cf3",
  "poster/announcement///landscape": "cf0c4dbccb2d101a",
  "poster/announcement///og": "7216d47e97e8da4d",
  "poster/announcement///a4": "6e3f2a017397cb22",
  "poster/announcement///a3": "7b2b1b9846ed214e",
  "certificate/attendance/landscape//cert_landscape": "a934cee105c6c12f",
  "certificate/attendance/portrait//cert_portrait": "baad37115e35ae54",
  "certificate/presenter/landscape//cert_landscape": "d39009b044af3a7e",
  "certificate/presenter/portrait//cert_portrait": "83b80040966d6ae4",
  "certificate/achievement/landscape//cert_landscape": "418b4f495e8a1a2f",
  "certificate/achievement/portrait//cert_portrait": "d657b14c21d0aefa",
  "uploaded/master": "b972c2ce04661f20",
  "uploaded/square": "37f566d3bdad9afb",
  "uploaded/story": "6d0a3ae7d656b833",
  "uploaded/landscape": "a692e274d23c6408",
  "uploaded/og": "5ebf5f08223616d3",
  "uploaded/a4": "a3ff4eb400a15806",
  "uploaded/a3": "16f68cd229ab048b"
}
;

const hash = (d: DesignDocument) => createHash("sha256").update(JSON.stringify(d) + renderDocumentToHtml(d, { fonts: [], bindings: { values: {} } })).digest("hex").slice(0, 16);

function uploaded(): DesignDocument {
  const presets: Record<string, { scale: "fill"; anchor: "center" }> = {};
  for (const n of presetsFor("poster")) presets[n] = { scale: "fill", anchor: "center" };
  return {
    schemaVersion: 1,
    purpose: "poster",
    master: { width: 1080, height: 1350, unit: "px", dpi: 72 },
    direction: "rtl",
    layers: [
      { id: "uploaded", kind: "image", frame: { x: 0, y: 0, w: 1080, h: 1350 }, locked: true, image: { assetId: "https://x/a.png", fit: "cover", focal: { x: 0.5, y: 0.5 } }, presets },
    ],
  } as DesignDocument;
}

describe("an untouched document derives and renders exactly as on main", () => {
  it("★ every baseline template, at every preset", () => {
    const now: Record<string, string> = {};
    for (const t of BASELINE_LIBRARY) {
      for (const p of presetsForDocument(t.document)) now[`${t.purpose}/${t.family}/${t.orientation ?? ""}//${p}`] = hash(derive(t.document, p));
    }
    const was = Object.fromEntries(Object.entries(BASELINE_HASHES).filter(([k]) => !k.startsWith("uploaded/")));
    expect(now).toEqual(was);
  });

  it("★ an uploaded poster's v1 document — `fill` keeps today's frame (D2b's new mode is v2-only)", () => {
    const now = Object.fromEntries(presetsFor("poster").map((p) => [`uploaded/${p}`, hash(derive(uploaded(), p))]));
    const was = Object.fromEntries(Object.entries(BASELINE_HASHES).filter(([k]) => k.startsWith("uploaded/")));
    expect(now).toEqual(was);
  });
});
