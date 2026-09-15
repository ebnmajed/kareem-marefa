// worker/src/tasks/convert_document.ts and render_pages.ts — 11 §2.4, 07 §4,
// DEC-058. The poppler module (worker/src/content/pdf.ts) and the Storage
// module (worker/src/content/storage.ts) are mocked on their own contracts,
// plus a fake `helpers.query`/`helpers.logger` standing in for
// graphile-worker's own Helpers — no real Postgres, no real poppler, no
// real Storage. The poppler wrappers themselves are covered by
// tests/unit/worker-pdf.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function setEnv() {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
}

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"
const NOT_PDF = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]); // a zip

type PdfInfo = import("../../worker/src/content/pdf").PdfInfo;
type Size = { width: number; height: number };

const storage = vi.hoisted(() => ({
  downloadObject: vi.fn<(bucket: string, path: string) => Promise<Uint8Array>>(async () => PDF_BYTES),
  uploadObject: vi.fn<(bucket: string, path: string, bytes: Uint8Array, contentType: string) => Promise<void>>(async () => undefined),
}));
const pdf = vi.hoisted(() => ({
  inspect: vi.fn<(pdfPath: string) => Promise<PdfInfo>>(async () => ({
    pages: 3,
    sizes: [{ width: 792, height: 612 }, { width: 792, height: 612 }, { width: 612, height: 792 }],
    fonts: [],
  })),
  render: vi.fn<(pdfPath: string, dir: string, n: number, size: Size, longEdge: number, quality: number) => Promise<{ webp: Uint8Array; width: number; height: number }>>(
    async (_pdf, _dir, n, _size, longEdge) => ({ webp: new Uint8Array([n, longEdge & 0xff]), width: longEdge, height: 100 }),
  ),
  installed: vi.fn(async () => new Set(["IBM Plex Sans Arabic", "IBM Plex Sans", "Amiri"])),
}));

vi.mock("../../worker/src/content/storage", () => ({
  downloadObject: storage.downloadObject,
  uploadObject: storage.uploadObject,
  deleteObject: vi.fn(),
}));
vi.mock("../../worker/src/content/pdf", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../worker/src/content/pdf")>();
  return {
    ...real,
    inspectPdf: pdf.inspect,
    renderPdfPage: pdf.render,
    fontsInstalled: pdf.installed,
    // No disk in the unit test: the "temp dir" is a name and the "staged
    // PDF" is a path nothing opens.
    withTempDir: async <T,>(_prefix: string, fn: (dir: string) => Promise<T>) => fn("/tmp/fake"),
    stagePdf: async () => "/tmp/fake/input.pdf",
  };
});

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

const ORG = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";
const VERSION = "33333333-3333-3333-3333-333333333333";
const MATERIAL = "44444444-4444-4444-4444-444444444444";
const ROW = { org_id: ORG, session_id: SESSION, storage_path: `${ORG}/sessions/${SESSION}/materials/${VERSION}/deck.pdf`, kind: "pdf" };

describe("convert_document", () => {
  beforeEach(() => {
    setEnv();
    storage.downloadObject.mockClear();
    storage.uploadObject.mockClear();
    pdf.inspect.mockClear();
    pdf.render.mockClear();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("★ downloads the source itself, inspects it with poppler, records the page count and the non-embedded fonts", async () => {
    pdf.inspect.mockResolvedValueOnce({
      pages: 5,
      sizes: Array.from({ length: 5 }, () => ({ width: 792, height: 612 })),
      fonts: [
        { name: "IBMPlexSansArabic-Regular", embedded: true },
        { name: "Cairo-Bold", embedded: false }, // named, not embedded, not in the image → substituted
        { name: "Amiri-Regular", embedded: false }, // not embedded but the image HAS it → renders faithfully
      ],
    });
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers();
    helpers.setRow(ROW);

    await convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never);

    expect(storage.downloadObject).toHaveBeenCalledWith("materials", ROW.storage_path);
    const recordCall = helpers.calls.find((c) => c.sql.includes("record_material_conversion"));
    expect(recordCall?.sql).toContain("false"); // the literal 4th argument, not a bound parameter
    expect(recordCall?.params).toEqual([VERSION, ["Cairo-Bold"], 5]);
  });

  it("a version that no longer exists is skipped (a warning, no error, no download, no record call)", async () => {
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers(); // no row set — the join finds nothing

    await convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never);

    expect(helpers.logger.warn).toHaveBeenCalled();
    expect(storage.downloadObject).not.toHaveBeenCalled();
    expect(helpers.calls.some((c) => c.sql.includes("record_material_conversion"))).toBe(false);
  });

  it("a material that is not a pdf is skipped — this job is never enqueued for it (DEC-058)", async () => {
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers();
    helpers.setRow({ ...ROW, kind: "image" });

    await convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never);

    expect(helpers.logger.warn).toHaveBeenCalledWith(expect.stringContaining("DEC-058"));
    expect(storage.downloadObject).not.toHaveBeenCalled();
  });

  it("★ a stored object that is not a PDF is marked failed and NOT retried — terminal, not a throw", async () => {
    storage.downloadObject.mockResolvedValueOnce(NOT_PDF);
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers();
    helpers.setRow(ROW);

    await expect(convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never)).resolves.toBeUndefined();

    const recordCall = helpers.calls.find((c) => c.sql.includes("record_material_conversion"));
    expect(recordCall?.sql).toContain("true");
    expect(recordCall?.params).toEqual([VERSION]);
    expect(pdf.inspect).not.toHaveBeenCalled();
  });

  it("★ a poppler failure marks the material failed (record_material_conversion with failed=true) and rethrows for graphile-worker's own retry", async () => {
    pdf.inspect.mockRejectedValueOnce(new Error("content/pdf: pdfinfo failed: Syntax Error"));
    const { convert_document } = await import("../../worker/src/tasks/convert_document");
    const helpers = fakeHelpers();
    helpers.setRow(ROW);

    await expect(convert_document({ version_id: VERSION, material_id: MATERIAL }, helpers as never)).rejects.toThrow(/pdfinfo/);

    const recordCall = helpers.calls.find((c) => c.sql.includes("record_material_conversion"));
    expect(recordCall?.params).toEqual([VERSION]);
  });
});

describe("render_pages", () => {
  beforeEach(() => {
    setEnv();
    storage.downloadObject.mockClear();
    storage.uploadObject.mockClear();
    pdf.inspect.mockClear();
    pdf.render.mockClear();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("★ renders a page and a thumbnail per page at 07 §4.5's sizes, uploads both under the path builder's paths, records every page", async () => {
    pdf.inspect.mockResolvedValueOnce({ pages: 2, sizes: [{ width: 792, height: 612 }, { width: 612, height: 792 }], fonts: [] });
    const { render_pages } = await import("../../worker/src/tasks/render_pages");
    const helpers = fakeHelpers();
    helpers.setRow(ROW);

    await render_pages({ version_id: VERSION, material_id: MATERIAL, page_count: 2 }, helpers as never);

    // Two renders per page: 1600 for the page, 320 for the thumbnail.
    expect(pdf.render.mock.calls.map((c) => [c[2], c[4], c[5]])).toEqual([
      [1, 1600, 82],
      [1, 320, 70],
      [2, 1600, 82],
      [2, 320, 70],
    ]);
    const uploads = storage.uploadObject.mock.calls.map((c) => [c[0], c[1], c[3]]);
    expect(uploads).toEqual([
      ["material-pages", `${ORG}/sessions/${SESSION}/pages/${VERSION}/1.webp`, "image/webp"],
      ["material-pages", `${ORG}/sessions/${SESSION}/pages/${VERSION}/thumbs/1.webp`, "image/webp"],
      ["material-pages", `${ORG}/sessions/${SESSION}/pages/${VERSION}/2.webp`, "image/webp"],
      ["material-pages", `${ORG}/sessions/${SESSION}/pages/${VERSION}/thumbs/2.webp`, "image/webp"],
    ]);

    const recordCall = helpers.calls.find((c) => c.sql.includes("record_material_pages"));
    expect(recordCall).toBeTruthy();
    const pageRows = JSON.parse(recordCall!.params[1] as string);
    expect(pageRows).toHaveLength(2);
    expect(pageRows[0]).toMatchObject({ page_number: 1, image_path: `${ORG}/sessions/${SESSION}/pages/${VERSION}/1.webp`, width: 1600 });
  });

  it("renders no more pages than the file actually has, and says so", async () => {
    pdf.inspect.mockResolvedValueOnce({ pages: 1, sizes: [{ width: 792, height: 612 }], fonts: [] });
    const { render_pages } = await import("../../worker/src/tasks/render_pages");
    const helpers = fakeHelpers();
    helpers.setRow(ROW);

    await render_pages({ version_id: VERSION, material_id: MATERIAL, page_count: 3 }, helpers as never);

    expect(helpers.logger.warn).toHaveBeenCalledWith(expect.stringContaining("payload said 3"));
    expect(storage.uploadObject).toHaveBeenCalledTimes(2);
  });

  it("a poppler failure marks the material failed and rethrows", async () => {
    pdf.render.mockRejectedValueOnce(new Error("content/pdf: pdftoppm failed"));
    const { render_pages } = await import("../../worker/src/tasks/render_pages");
    const helpers = fakeHelpers();
    helpers.setRow(ROW);

    await expect(render_pages({ version_id: VERSION, material_id: MATERIAL, page_count: 1 }, helpers as never)).rejects.toThrow(/pdftoppm/);

    const recordCall = helpers.calls.find((c) => c.sql.includes("record_material_conversion"));
    expect(recordCall?.params).toEqual([VERSION]);
  });

  it("a version that no longer exists is skipped", async () => {
    const { render_pages } = await import("../../worker/src/tasks/render_pages");
    const helpers = fakeHelpers();

    await render_pages({ version_id: VERSION, material_id: MATERIAL, page_count: 3 }, helpers as never);

    expect(helpers.logger.warn).toHaveBeenCalled();
    expect(storage.downloadObject).not.toHaveBeenCalled();
  });
});
