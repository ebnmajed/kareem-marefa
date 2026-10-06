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
//
// ★★ AND A FOURTH TIME (DEC-274): the HTML, not the documents. These hashes render with NO bindings, so every
// template's org-logo layer is unbound — and an unbound org logo now draws the platform mark instead of the dashed
// placeholder that was exporting into posters and shared-link previews. The forty-one move for that one reason and
// no geometry moves (the parity suite holds at 0.000 %). The seven `uploaded/*` did not move: they bind no logo.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BASELINE_LIBRARY, derive, presetsFor, presetsForDocument, renderDocumentToHtml, type DesignDocument } from "@kareem/designer-runtime";

const BASELINE_HASHES: Record<string, string> = 
{
  "poster/talk///master": "9264b8d330060948",
  "poster/talk///square": "2109d1529f5134ba",
  "poster/talk///story": "a333ec7eaa6e4863",
  "poster/talk///landscape": "5a8aa5daaad0e650",
  "poster/talk///og": "b1a6cdbe0ebc7ded",
  "poster/talk///a4": "308f6e842f9166d0",
  "poster/talk///a3": "abf8ad8fe83b6374",
  "poster/workshop///master": "fe6cd9aa1184a385",
  "poster/workshop///square": "5f7aa0a162a94358",
  "poster/workshop///story": "278528a279ee3de6",
  "poster/workshop///landscape": "cf2e4e434a89c862",
  "poster/workshop///og": "414f2cad7d3a9fd9",
  "poster/workshop///a4": "2039bdc9b96d352e",
  "poster/workshop///a3": "0f700ec060d3b700",
  "poster/panel///master": "6881ae754d8e7638",
  "poster/panel///square": "422da1f7d98294b2",
  "poster/panel///story": "bb22eb0217768314",
  "poster/panel///landscape": "c25825995c766851",
  "poster/panel///og": "917858b2707f6226",
  "poster/panel///a4": "a537928f4b419098",
  "poster/panel///a3": "8b2c403a984f8792",
  "poster/meetup///master": "cd4b2fb323860fa1",
  "poster/meetup///square": "ea1d173a5f516464",
  "poster/meetup///story": "5ffafc28fce9acaa",
  "poster/meetup///landscape": "db97e6a976827e1f",
  "poster/meetup///og": "d69fa67a320406e3",
  "poster/meetup///a4": "ba8b9593369b141d",
  "poster/meetup///a3": "26be355adfc4ae1b",
  "poster/announcement///master": "818cb3df73557fe6",
  "poster/announcement///square": "73982a160e687832",
  "poster/announcement///story": "f985a372b09fda62",
  "poster/announcement///landscape": "de4b438ec3c95be4",
  "poster/announcement///og": "d2f64c051786e64f",
  "poster/announcement///a4": "68f1ee34179a8805",
  "poster/announcement///a3": "c3e1f18a19fba73f",
  "certificate/attendance/landscape//cert_landscape": "bd48093210576ec3",
  "certificate/attendance/portrait//cert_portrait": "7df44e97ea01ab02",
  "certificate/presenter/landscape//cert_landscape": "1e3e83bb0b4983f7",
  "certificate/presenter/portrait//cert_portrait": "7ff7619086213998",
  "certificate/achievement/landscape//cert_landscape": "a4ff60fe21c6c796",
  "certificate/achievement/portrait//cert_portrait": "6cf6538e716e5b95",
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
