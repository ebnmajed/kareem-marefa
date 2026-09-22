// DEC-179 — an image's asset id becomes its bytes in the worker's render.
//
// ★ Until wave 13 every uploaded poster and every worker-generated logo
// rendered `<img src="<uuid>">`, broken. These pin the worker's side: the ids
// are found through the renderer's own resolution (a direct `image.assetId` and
// a `brand.logoAssetId` binding), looked up in THIS org only, downloaded, and
// inlined as `data:` URIs; another org's id and an over-budget set are refused,
// never drawn broken or truncated. The render itself is asserted by
// `wave13-designer-upload-render.spec.ts`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderDocumentToHtml, type DesignDocument, type Layer } from "@kareem/designer-runtime";

const downloadObject = vi.fn();
vi.mock("../../worker/src/content/storage.js", () => ({ downloadObject: (...a: unknown[]) => downloadObject(...a) }));

const { inlineAssets, AssetRefusal, MAX_INLINE_ASSET_BYTES } = await import("../../worker/src/render/assets");

const UPLOAD = "11111111-2222-4333-8444-555555555555";
const LOGO = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const doc: DesignDocument = {
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  layers: [
    { id: "uploaded", kind: "image", frame: { x: 0, y: 0, w: 1080, h: 1350 }, image: { assetId: UPLOAD, fit: "cover" } } as Layer,
    { id: "l_logo", kind: "image", frame: { x: 80, y: 80, w: 160, h: 160 }, image: { binding: "brand.logoAssetId", fit: "contain" } } as Layer,
    { id: "l_url", kind: "image", frame: { x: 80, y: 300, w: 160, h: 160 }, image: { assetId: "https://example.invalid/a.png", fit: "contain" } } as Layer,
  ],
};

function helpers(rows: Array<{ id: string; storage_path: string; sniffed_mime: string; byte_size: number }>) {
  const query = vi.fn(async (_sql: string, params?: unknown[]) => {
    const [orgId, ids] = params as [string, string[]];
    return { rows: orgId === "org-a" ? rows.filter((r) => ids.includes(r.id)) : [] };
  });
  return { query } as never;
}

beforeEach(() => downloadObject.mockReset().mockResolvedValue(new Uint8Array([137, 80, 78, 71])));

describe("inlineAssets", () => {
  it("★ both kinds of reference — a direct id and the logo's binding — become data: URIs; a URL is left alone", async () => {
    const h = helpers([
      { id: UPLOAD, storage_path: "org-a/assets/u.png", sniffed_mime: "image/png", byte_size: 4 },
      { id: LOGO, storage_path: "org-a/assets/l.png", sniffed_mime: "image/png", byte_size: 4 },
    ]);
    const assets = await inlineAssets(h, "org-a", doc, { "brand.logoAssetId": LOGO });
    expect(Object.keys(assets).sort()).toEqual([LOGO, UPLOAD].sort());
    expect(assets[UPLOAD]).toBe("data:image/png;base64,iVBORw==");
    expect(downloadObject).toHaveBeenCalledWith("design-assets", "org-a/assets/u.png");

    const html = renderDocumentToHtml(doc, { fonts: [], bindings: { values: { "brand.logoAssetId": LOGO }, assets } });
    expect(html).not.toContain(`src="${UPLOAD}"`);
    expect(html).not.toContain(`src="${LOGO}"`);
    expect(html).toContain('src="data:image/png;base64,iVBORw=="');
    expect(html).toContain('src="https://example.invalid/a.png"');
  });

  it("★ another org's asset id is REFUSED, never drawn broken or borrowed", async () => {
    const h = helpers([{ id: UPLOAD, storage_path: "org-a/assets/u.png", sniffed_mime: "image/png", byte_size: 4 }]);
    await expect(inlineAssets(h, "org-b", doc, {})).rejects.toBeInstanceOf(AssetRefusal);
    expect(downloadObject).not.toHaveBeenCalled();
  });

  it("★ over the budget is refused whole — never truncated", async () => {
    const h = helpers([{ id: UPLOAD, storage_path: "org-a/assets/u.png", sniffed_mime: "image/png", byte_size: MAX_INLINE_ASSET_BYTES + 1 }]);
    await expect(inlineAssets(h, "org-a", doc, {})).rejects.toThrow(/render budget/);
    expect(downloadObject).not.toHaveBeenCalled();
  });

  it("a document with no asset images asks nothing of the database", async () => {
    const h = helpers([]);
    const plain = { ...doc, layers: [doc.layers[2] as Layer] };
    expect(await inlineAssets(h, "org-a", plain, {})).toEqual({});
    expect((h as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });
});
