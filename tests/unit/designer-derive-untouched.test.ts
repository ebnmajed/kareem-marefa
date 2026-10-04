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
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BASELINE_LIBRARY, derive, presetsFor, presetsForDocument, renderDocumentToHtml, type DesignDocument } from "@kareem/designer-runtime";

const BASELINE_HASHES: Record<string, string> = 
{
  "poster/talk///master": "838e1d19d1498e42",
  "poster/talk///square": "05ca59bb4f86d066",
  "poster/talk///story": "643a5e0a1dd579c4",
  "poster/talk///landscape": "b5fa12fe60108792",
  "poster/talk///og": "d78ddc6d94756e84",
  "poster/talk///a4": "d4a0207d0645d552",
  "poster/talk///a3": "15c55f15b0bdf8ee",
  "poster/workshop///master": "68c508e2adec999c",
  "poster/workshop///square": "81841dc2b274b4e0",
  "poster/workshop///story": "44395970ef9f3f49",
  "poster/workshop///landscape": "d694c7aa894c16a7",
  "poster/workshop///og": "34cd03a8e0e346df",
  "poster/workshop///a4": "641d20a3c9a0cc4b",
  "poster/workshop///a3": "916595587361f566",
  "poster/panel///master": "d1877b4840db9ded",
  "poster/panel///square": "32ee701d92e4f7c4",
  "poster/panel///story": "c4604c37ede2b14a",
  "poster/panel///landscape": "f30a3a4f02d058a7",
  "poster/panel///og": "c387cbb71293a5c3",
  "poster/panel///a4": "2e81ad61657b0aa3",
  "poster/panel///a3": "36593099a9ff529a",
  "poster/meetup///master": "4f637574f7d67b01",
  "poster/meetup///square": "6dfcb9afc53f2ffa",
  "poster/meetup///story": "21c911d45bf7a179",
  "poster/meetup///landscape": "54e51f7f9cb05e0a",
  "poster/meetup///og": "45358c64fc283767",
  "poster/meetup///a4": "549635bd3d7fa8f3",
  "poster/meetup///a3": "f415276784866580",
  "poster/announcement///master": "e88a9042c9b0928e",
  "poster/announcement///square": "ae85a5565f6a8887",
  "poster/announcement///story": "c029f79c28f32f4a",
  "poster/announcement///landscape": "d23c6ddd89d101ae",
  "poster/announcement///og": "4ab15378156390de",
  "poster/announcement///a4": "f80b86f0adaf30d4",
  "poster/announcement///a3": "0e8747e8179b317f",
  "certificate/attendance/landscape//cert_landscape": "f28553ea7bd0132a",
  "certificate/attendance/portrait//cert_portrait": "c12cff03da4fa68f",
  "certificate/presenter/landscape//cert_landscape": "7a64346620b9de4b",
  "certificate/presenter/portrait//cert_portrait": "a8a25ab42c48fc6e",
  "certificate/achievement/landscape//cert_landscape": "564d309e84707968",
  "certificate/achievement/portrait//cert_portrait": "275ba6caa22f8d3c",
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
