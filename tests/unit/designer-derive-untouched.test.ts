// ★ No golden moves — the unit-level proof (REQ-DSG-030's «an untouched document
// derives identically», DEC-176 §1, DEC-178's first condition on D2b).
//
// Every seeded baseline template, at every preset it exports, and an uploaded
// poster's document as `uploadedPosterDocument()` has written it since wave 3:
// `derive()`'s output and `renderDocumentToHtml()`'s HTML for it, hashed. The
// hashes were taken from `main`'s runtime at `46bbb15` — the one `main`'s worker
// runs — built separately and compared byte for byte with this branch's before
// they were written here (`designer.md` W13.6).
//
// A hash that changes here is a render that changes for a document nobody
// touched. That is a bug to report, never a hash to refresh — exactly as a moved
// parity golden is (REQ-DSG-015). The parity harness proves the pixels; this
// proves the input to them, for more documents than the harness has cases.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BASELINE_LIBRARY, derive, presetsFor, presetsForDocument, renderDocumentToHtml, type DesignDocument } from "@kareem/designer-runtime";

const MAIN_46BBB15: Record<string, string> = 
{
  "poster/talk///master": "bde5658803fbd4f6",
  "poster/talk///square": "f7f26000da9b5f6d",
  "poster/talk///story": "bdb054c289784bd3",
  "poster/talk///landscape": "00f3ea9d183ebadd",
  "poster/talk///og": "0f621fbebdd374d0",
  "poster/talk///a4": "02f388618213ccf6",
  "poster/talk///a3": "d9d7fc777e4334c9",
  "poster/workshop///master": "6bb66ab2d26865eb",
  "poster/workshop///square": "08b66656142c9128",
  "poster/workshop///story": "3fbe0cca06cc9739",
  "poster/workshop///landscape": "0111795231e23cb0",
  "poster/workshop///og": "d570672f694f13d0",
  "poster/workshop///a4": "9bd7321636ddeffd",
  "poster/workshop///a3": "15509951673445c5",
  "poster/panel///master": "72d64824831e848b",
  "poster/panel///square": "150f9827727aaafc",
  "poster/panel///story": "bcc81a8a4f2d6fb6",
  "poster/panel///landscape": "dc1f0c03e4021323",
  "poster/panel///og": "f4b9ab0f9e46e239",
  "poster/panel///a4": "57014171f2705b5f",
  "poster/panel///a3": "cb5fada66e2e7156",
  "poster/meetup///master": "afcbc927048ff797",
  "poster/meetup///square": "76199cea459e1a40",
  "poster/meetup///story": "b7a2837313d9844a",
  "poster/meetup///landscape": "d76536f42afc8992",
  "poster/meetup///og": "6910bb8e1156a8fa",
  "poster/meetup///a4": "3346ff451b72f0ba",
  "poster/meetup///a3": "dd4646c187850f59",
  "poster/announcement///master": "36e3258c72052378",
  "poster/announcement///square": "55697d7034d285d3",
  "poster/announcement///story": "6ecaa224ba458166",
  "poster/announcement///landscape": "503cc7dfe978d900",
  "poster/announcement///og": "aa216d7c222a1ec4",
  "poster/announcement///a4": "95bea5e31a25fc3c",
  "poster/announcement///a3": "6193164c34e5bf6b",
  "certificate/attendance/landscape//cert_landscape": "b84955146925c9db",
  "certificate/attendance/portrait//cert_portrait": "b29cfb515c30f12b",
  "certificate/presenter/landscape//cert_landscape": "74dcaff508b9aac0",
  "certificate/presenter/portrait//cert_portrait": "992602eba2bfeb88",
  "certificate/achievement/landscape//cert_landscape": "2a7fb02a483ee0f8",
  "certificate/achievement/portrait//cert_portrait": "fdee6c5a4891c133",
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
    const was = Object.fromEntries(Object.entries(MAIN_46BBB15).filter(([k]) => !k.startsWith("uploaded/")));
    expect(now).toEqual(was);
  });

  it("★ an uploaded poster's v1 document — `fill` keeps today's frame (D2b's new mode is v2-only)", () => {
    const now = Object.fromEntries(presetsFor("poster").map((p) => [`uploaded/${p}`, hash(derive(uploaded(), p))]));
    const was = Object.fromEntries(Object.entries(MAIN_46BBB15).filter(([k]) => k.startsWith("uploaded/")));
    expect(now).toEqual(was);
  });
});
