// worker/src/tasks/convert_document.ts and render_pages.ts — 11 §2.4, 07 §4.
// A fake `fetch` standing in for BOTH Supabase Storage's REST signing
// endpoints (worker/src/content/storage.ts's own contract) and the
// converter's documented HTTP contract (converter/server.mjs's `/convert`
// and `/pages`, read directly rather than guessed), plus a fake
// `helpers.query`/`helpers.logger` standing in for graphile-worker's own
// Helpers — no real Postgres, no real converter, no real Storage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function setEnv() {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.CONVERTER_URL = "http://127.0.0.1:8080";
}

function fakeHelpers() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("from public.material_versions mv join public.materials m")) {
      return { rows: (query as unknown as { __row?: unknown[] }).__row ?? [] };
    }
    return { rows: [] };
  });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { query, logger, calls, setRow: (row: unknown) => ((query as unknown as { __row: unknown[] }).__row = [row]) };
}

/** Routes a fake fetch across the three real HTTP contracts these tasks call:
 *  Storage's sign endpoints (worker/src/content/storage.ts), and the
 *  converter's /convert and /pages (converter/server.mjs). */
function fakeFetch(overrides: { convert?: unknown; pages?: unknown; convertOk?: boolean; pagesOk?: boolean } = {}) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/storage/v1/object/upload/sign/")) {
      return new Response(JSON.stringify({ url: `/object/upload/sign/x?token=fake` }), { status: 200 });
    }
    if (url.includes("/storage/v1/object/sign/")) {
      return new Response(JSON.stringify({ signedURL: `/object/sign/x?token=fake` }), { status: 200 });
    }
    if (url.endsWith("/convert")) {
      if (overrides.convertOk === false) return new Response("converter error", { status: 500 });
      return new Response(JSON.stringify(overrides.convert ?? { pages: 3, fonts: { substituted: [] } }), { status: 200 });
    }
    if (url.endsWith("/pages")) {
      if (overrides.pagesOk === false) return new Response("converter error", { status: 500 });
      return new Response(JSON.stringify(overrides.pages ?? { rendered: 3, total: 3 }), { status: 200 });
    }
    throw new Error(`fakeFetch: unexpected URL ${url} (init: ${JSON.stringify(init)})`);
  });
}

const ORG = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";
const VERSION = "33333333-3333-3333-3333-333333333333";
const MATERIAL = "44444444-4444-4444-4444-444444444444";

describe("convert_document", () => {
  beforeEach(() => setEnv());
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("★ pdf: signs a read URL for the source itself, calls /convert with no output url, records the conversion", async () => {
    const fetchMock = fakeFetch({ convert: { pages: 5, fonts: { substituted: ["Amiri"] } } });
    vi.stubGlobal("fetch", fetchMock);
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers();
    helpers.setRow({ org_id: ORG, session_id: SESSION, storage_path: "x/y/deck.pdf", kind: "pdf" });

    await convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never);

    const convertCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/convert"));
    expect(convertCall).toBeTruthy();
    const body = JSON.parse((convertCall![1] as RequestInit).body as string);
    expect(body.input.kind).toBe("pdf");
    expect(body.output).toBeUndefined(); // a pdf material has nothing for the converter to produce — it reads it as-is

    const recordCall = helpers.calls.find((c) => c.sql.includes("record_material_conversion"));
    expect(recordCall?.sql).toContain("false"); // the literal 4th argument, not a bound parameter
    expect(recordCall?.params).toEqual([VERSION, ["Amiri"], 5]);
  });

  it("★ powerpoint: signs BOTH a read url and a write url for the intermediate PDF, sent as output.pdf.url", async () => {
    const fetchMock = fakeFetch({ convert: { pages: 2, fonts: { substituted: [] } } });
    vi.stubGlobal("fetch", fetchMock);
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers();
    helpers.setRow({ org_id: ORG, session_id: SESSION, storage_path: "x/y/deck.pptx", kind: "powerpoint" });

    await convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never);

    const convertCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/convert"));
    const body = JSON.parse((convertCall![1] as RequestInit).body as string);
    expect(body.input.kind).toBe("powerpoint");
    expect(body.output.pdf.url).toContain("/object/upload/sign/");
  });

  it("a version that no longer exists is skipped (a warning, no error, no record call)", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers(); // no row set — the join finds nothing

    await convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never);

    expect(helpers.logger.warn).toHaveBeenCalled();
    expect(helpers.calls.some((c) => c.sql.includes("record_material_conversion"))).toBe(false);
  });

  it("★ a converter failure marks the material failed (record_material_conversion with failed=true) and rethrows for graphile-worker's own retry", async () => {
    vi.stubGlobal("fetch", fakeFetch({ convertOk: false }));
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers();
    helpers.setRow({ org_id: ORG, session_id: SESSION, storage_path: "x/y/deck.pdf", kind: "pdf" });

    await expect(convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never)).rejects.toThrow();

    const recordCall = helpers.calls.find((c) => c.sql.includes("record_material_conversion"));
    expect(recordCall?.params).toEqual([VERSION]);
  });

  it("throws immediately when CONVERTER_URL is not set — never calls fetch", async () => {
    delete process.env.CONVERTER_URL;
    const fetchMock = fakeFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers();

    await expect(convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never)).rejects.toThrow(/CONVERTER_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("render_pages", () => {
  beforeEach(() => setEnv());
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("★ signs one upload URL per page and thumbnail, calls /pages, records every page through record_material_pages", async () => {
    const fetchMock = fakeFetch({ pages: { rendered: 2, total: 2 } });
    vi.stubGlobal("fetch", fetchMock);
    const { render_pages } = await import("../../worker/src/tasks/render_pages");
    const helpers = fakeHelpers();
    helpers.setRow({ org_id: ORG, session_id: SESSION, storage_path: "x/y/deck.pdf", kind: "pdf" });

    await render_pages({ version_id: VERSION, material_id: MATERIAL, page_count: 2 }, helpers as never);

    const pagesCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/pages"));
    const body = JSON.parse((pagesCall![1] as RequestInit).body as string);
    expect(body.output.pages).toHaveLength(2);
    expect(body.output.pages.map((p: { n: number }) => p.n)).toEqual([1, 2]);

    const recordCall = helpers.calls.find((c) => c.sql.includes("record_material_pages"));
    expect(recordCall).toBeTruthy();
    const pageRows = JSON.parse(recordCall!.params[1] as string);
    expect(pageRows).toHaveLength(2);
    expect(pageRows[0]).toMatchObject({ page_number: 1 });
  });

  it("★ a powerpoint material reads the intermediate PDF (convertedPdfPath), not the original upload", async () => {
    const fetchMock = fakeFetch({ pages: { rendered: 1, total: 1 } });
    vi.stubGlobal("fetch", fetchMock);
    const { render_pages } = await import("../../worker/src/tasks/render_pages");
    const helpers = fakeHelpers();
    helpers.setRow({ org_id: ORG, session_id: SESSION, storage_path: "x/y/deck.pptx", kind: "powerpoint" });

    await render_pages({ version_id: VERSION, material_id: MATERIAL, page_count: 1 }, helpers as never);

    // The sign(read) call must have targeted converted.pdf, not deck.pptx —
    // both go through the same /storage/v1/object/sign/materials/ prefix,
    // so check the specific path segment landed on the request.
    const signCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes("/storage/v1/object/sign/materials/"));
    expect(signCalls.some(([u]) => String(u).includes("converted.pdf"))).toBe(true);
    expect(signCalls.some(([u]) => String(u).includes("deck.pptx"))).toBe(false);
  });

  it("a converter /pages failure marks the material failed and rethrows", async () => {
    vi.stubGlobal("fetch", fakeFetch({ pagesOk: false }));
    const { render_pages } = await import("../../worker/src/tasks/render_pages");
    const helpers = fakeHelpers();
    helpers.setRow({ org_id: ORG, session_id: SESSION, storage_path: "x/y/deck.pdf", kind: "pdf" });

    await expect(render_pages({ version_id: VERSION, material_id: MATERIAL, page_count: 1 }, helpers as never)).rejects.toThrow();

    const recordCall = helpers.calls.find((c) => c.sql.includes("record_material_conversion"));
    expect(recordCall?.params).toEqual([VERSION]);
  });

  it("a version that no longer exists is skipped", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const { render_pages } = await import("../../worker/src/tasks/render_pages");
    const helpers = fakeHelpers();

    await render_pages({ version_id: VERSION, material_id: MATERIAL, page_count: 3 }, helpers as never);

    expect(helpers.logger.warn).toHaveBeenCalled();
  });
});
