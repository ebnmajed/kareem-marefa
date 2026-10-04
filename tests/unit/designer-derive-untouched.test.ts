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
//
// ★★ AND A THIRD TIME, for `inlineAnchor` — the fix for a 16:9 poster that used
// 40 % of its width. All 41 move because every poster document gained the field
// and this hash covers the document's JSON as well as its HTML. ★ FIFTEEN
// derivations moved GEOMETRICALLY, measured by deriving each document with and
// without the field and diffing every frame: five poster families × `square`,
// `landscape` and `og`, two layers each — the logo and the QR, returning to the
// corners they name. `master`, `story`, `a4`, `a3` and all six certificates are
// byte-identical in geometry, which is the proof the change reached only the
// presets that were wrong and nothing else.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BASELINE_LIBRARY, derive, presetsFor, presetsForDocument, renderDocumentToHtml, type DesignDocument } from "@kareem/designer-runtime";

const BASELINE_HASHES: Record<string, string> = 
{
  "poster/talk///master": "e7c2f2ce1b14e08b",
  "poster/talk///square": "17550398e41fae90",
  "poster/talk///story": "0374fcfca584fe38",
  "poster/talk///landscape": "8776cb1be1294a88",
  "poster/talk///og": "d3e28b319ec951f6",
  "poster/talk///a4": "bc19ac97c96ac292",
  "poster/talk///a3": "4572f815a604fc13",
  "poster/workshop///master": "3532115208ec5dc8",
  "poster/workshop///square": "1a7ac55f6faca145",
  "poster/workshop///story": "9e2f25ee69c8e679",
  "poster/workshop///landscape": "fa4a939611cda35f",
  "poster/workshop///og": "faf05516fd12d011",
  "poster/workshop///a4": "eddf451228b8aea9",
  "poster/workshop///a3": "5187c62b66976eae",
  "poster/panel///master": "316a29c3bad11563",
  "poster/panel///square": "637a422188b189cf",
  "poster/panel///story": "e2b70cf36c2774c2",
  "poster/panel///landscape": "a8c1992cddc6729c",
  "poster/panel///og": "ef27cc789f4aa534",
  "poster/panel///a4": "cf7d9c4632533cc9",
  "poster/panel///a3": "5675cc49def7479b",
  "poster/meetup///master": "f4eb9e3034a8f3eb",
  "poster/meetup///square": "515e4e7ca755872a",
  "poster/meetup///story": "77041b5ee0164b87",
  "poster/meetup///landscape": "6ca502bb5bc7d512",
  "poster/meetup///og": "c921b66f2afba835",
  "poster/meetup///a4": "d1ddb36ea118bce7",
  "poster/meetup///a3": "2e5dcc9908962e4b",
  "poster/announcement///master": "ea3634437129d500",
  "poster/announcement///square": "57447974a5fc9248",
  "poster/announcement///story": "6f4264d0c611309a",
  "poster/announcement///landscape": "b7b11ceab27b8c23",
  "poster/announcement///og": "74091d8776c3ba96",
  "poster/announcement///a4": "41227f6232b98530",
  "poster/announcement///a3": "ac21f5f8074f233a",
  "certificate/attendance/landscape//cert_landscape": "8cdd9d03bcd27e40",
  "certificate/attendance/portrait//cert_portrait": "ef981348a81d79d4",
  "certificate/presenter/landscape//cert_landscape": "ce4ffd1fd1fd8628",
  "certificate/presenter/portrait//cert_portrait": "1502967992606c52",
  "certificate/achievement/landscape//cert_landscape": "7adca72cd0b36cd7",
  "certificate/achievement/portrait//cert_portrait": "18e288c392499005",
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
