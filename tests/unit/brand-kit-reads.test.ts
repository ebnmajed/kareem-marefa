// SCR-059's reads under failure (wave 26, the lead's question after a transient e2e error) — REQ-UIX-116, REQ-DSG-021.
// ★ A read whose failure would be SAVED as data fails hard: the logo, a font, the selectable faces. Degrading any of
// them to «none» was silent data loss — edit mode posts what they return, so the next save would unbind the org's logo
// or reset its faces. Absence is still `null`; only an error throws.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown };
const results: Record<string, Result> = {};
const builder = (table: string) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(results[table]),
    maybeSingle: () => Promise.resolve(results[table]),
  };
  return chain;
};
const supabase = {
  rpc: vi.fn(async () => results.rpc),
  from: (table: string) => builder(table),
};
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({ supabase, session: { orgId: "o" } }) }));

const { getBrandKit } = await import("@/lib/brand/kit");
const { listSelectableFonts } = await import("@/lib/brand/fonts");

const RAW = {
  orgId: "11111111-1111-4111-8111-111111111111",
  isOverridden: true,
  light: {},
  dark: {},
  logoAssetId: "22222222-2222-4222-8222-222222222222",
  headingFontId: "33333333-3333-4333-8333-333333333333",
  bodyFontId: null,
  updatedAt: "2026-10-05T10:00:00+00:00",
};
const LOGO = { id: RAW.logoAssetId, storage_path: "o/a.png", width: 3600, height: 5000, sniffed_mime: "image/png", byte_size: 17520 };
const FONT = { id: RAW.headingFontId, family: "Baloo Bhaijaan 2", weight: 800, style: "normal", sha256: "a".repeat(64) };
const boom = { code: "57014", message: "canceling statement due to statement timeout" };

describe("getBrandKit under failure", () => {
  it("reads the logo with its sniffed format and size, and the chosen face", async () => {
    Object.assign(results, { rpc: { data: RAW, error: null }, design_assets: { data: LOGO, error: null }, fonts: { data: FONT, error: null } });
    const kit = await getBrandKit("ar", RAW.orgId);
    expect(kit.logo).toMatchObject({ assetId: LOGO.id, mime: "image/png", byteSize: 17520 });
    expect(kit.headingFont?.family).toBe("Baloo Bhaijaan 2");
  });

  it("★ a failed logo read throws — never «no logo», which the next save would write", async () => {
    Object.assign(results, { rpc: { data: RAW, error: null }, design_assets: { data: null, error: boom }, fonts: { data: FONT, error: null } });
    await expect(getBrandKit("ar", RAW.orgId)).rejects.toMatchObject({ code: "57014" });
  });

  it("★ a failed font read throws — never «platform default»", async () => {
    Object.assign(results, { rpc: { data: RAW, error: null }, design_assets: { data: LOGO, error: null }, fonts: { data: null, error: boom } });
    await expect(getBrandKit("ar", RAW.orgId)).rejects.toMatchObject({ code: "57014" });
  });

  it("an absent logo row is still null, not an error", async () => {
    Object.assign(results, { rpc: { data: RAW, error: null }, design_assets: { data: null, error: null }, fonts: { data: FONT, error: null } });
    expect((await getBrandKit("ar", RAW.orgId)).logo).toBeNull();
  });
});

describe("listSelectableFonts under failure", () => {
  it("★ a failed read throws — an empty list would disable the pickers, and a disabled select is not posted", async () => {
    results.fonts = { data: null, error: boom };
    await expect(listSelectableFonts("ar")).rejects.toMatchObject({ code: "57014" });
  });

  it("no passed face is an honest empty list", async () => {
    results.fonts = { data: [], error: null };
    expect(await listSelectableFonts("ar")).toEqual([]);
  });
});
