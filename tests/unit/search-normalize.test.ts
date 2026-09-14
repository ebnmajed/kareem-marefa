// arNormalize — REQ-DSC-004. Must stay byte-for-byte the same transformation
// as `public.ar_normalize()` (supabase/migrations/0037): "معرفات" and
// "مُعرِّفات" have to fold to the identical string for the client-side
// query and the server-side `search_vector`/`tags.normalised` to agree.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { arNormalize } = await import("@/lib/dal/search");

describe("arNormalize", () => {
  it("★ REQ-DSC-004: strips tashkeel so مُعرِّفات and معرفات match", () => {
    expect(arNormalize("مُعرِّفات")).toBe(arNormalize("معرفات"));
  });

  it("★ REQ-DSC-004: folds alef forms (أ إ آ ٱ → ا) so إدارة and ادارة match", () => {
    expect(arNormalize("إدارة")).toBe(arNormalize("ادارة"));
    expect(arNormalize("أحمد")).toBe(arNormalize("احمد"));
    expect(arNormalize("آمن")).toBe(arNormalize("امن"));
  });

  it("folds yaa/alef-maqsura (ى → ي) and taa-marbuta (ة → ه)", () => {
    expect(arNormalize("مستشفى")).toBe(arNormalize("مستشفي"));
    expect(arNormalize("مدرسة")).toBe(arNormalize("مدرسه"));
  });

  it("collapses repeated whitespace and trims", () => {
    expect(arNormalize("  جلسة   تحضيرية  ")).toBe("جلسه تحضيريه");
  });

  it("removes the tatweel (ـ) elongation character", () => {
    expect(arNormalize("جـلـسـة")).toBe(arNormalize("جلسة"));
  });
});
