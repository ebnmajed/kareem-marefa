// Wave 16 — was a surface rendered for the DOCUMENT (a hard load) or for the app's own navigation?
// (REQ-UIX-044, DEC-197 §5; the lead's cold-phone gates.) Read from Fetch Metadata's `Sec-Fetch-Dest`,
// conservatively: `document` or absent is the document, so an unknown request never replays over the truth.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const { isDocumentLoad, isDocumentRequest } = await import("@/components/scoring/document-load");

beforeEach(() => {
  requestHeaders = new Headers();
});

describe("isDocumentRequest", () => {
  it("a top-level navigation — a hard load, a reload, a link from outside — is the document", () => {
    expect(isDocumentRequest("document")).toBe(true);
    expect(isDocumentRequest(" Document ")).toBe(true);
  });
  it("★ the router's own fetch — a link, a tab, back/forward, refresh() — is not", () => {
    expect(isDocumentRequest("empty")).toBe(false);
  });
  it("★ absent — an old browser, a proxy that drops it — counts as the document: the static state, never a replay", () => {
    expect(isDocumentRequest(null)).toBe(true);
  });
});

describe("isDocumentLoad — reads the request's own header", () => {
  it("document, empty, and absent", async () => {
    requestHeaders.set("sec-fetch-dest", "document");
    expect(await isDocumentLoad()).toBe(true);
    requestHeaders.set("sec-fetch-dest", "empty");
    expect(await isDocumentLoad()).toBe(false);
    requestHeaders.delete("sec-fetch-dest");
    expect(await isDocumentLoad()).toBe(true);
  });
  it("★ does not read Next's `rsc` header, which Next strips before a page sees it", async () => {
    requestHeaders.set("rsc", "1");
    expect(await isDocumentLoad()).toBe(true);
  });
});
