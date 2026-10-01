// «ماذا يمنحك نقاطًا؟» rebuilt (wave 20, REQ-UIX-072, REQ-PTS-014, M10c §2, D37). Re-homes the retired
// `points-catalogue` cases; ★ one expectation moves: a disabled rule draws `0`, not its configured value.
import { render, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import scoring from "@/messages/ar/scoring.json";
import type { CatalogueEntry } from "@/lib/dal/points";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages: scoring, namespace: namespace as never }),
}));

const { PointsCatalogueList } = await import("@/components/scoring/points-catalogue-list");

const rule = (actionKey: string, points: number, extra: Partial<CatalogueEntry> = {}): CatalogueEntry => ({ actionKey, points, enabled: true, reasonAr: actionKey, capPerSession: null, ...extra });

async function draw(entries: CatalogueEntry[]) {
  const ui = await PointsCatalogueList({ entries });
  return render(<>{ui}</>).container;
}

describe("PointsCatalogueList", () => {
  it("renders nothing when every rule is worth zero (the negative catalogue)", async () => {
    expect((await draw([rule("no_show", 0), rule("late_cancellation", 0)])).innerHTML).toBe("");
  });

  it("lists an enabled rule with its value and its cap in words, read live", async () => {
    const c = await draw([rule("تعليق", 2, { capPerSession: 5 })]);
    const li = c.querySelector("#catalogue li")!;
    expect(li.textContent).toContain("تعليق");
    expect(li.textContent).toContain("5 مرات لكل جلسة");
    expect(li.querySelector("bdi[aria-hidden]")!.textContent).toBe("2");
    expect(within(c).getByRole("heading", { name: "ماذا يمنحك نقاطًا؟" })).toBeTruthy();
  });

  it("★ a disabled rule says so and draws 0 — it pays nothing now (M10c §2)", async () => {
    const c = await draw([rule("صورة من الجلسة", 3, { enabled: false })]);
    const li = c.querySelector("#catalogue li")!;
    expect(li.textContent).toContain("غير مُفعَّل حاليًا");
    expect(li.querySelector("bdi[aria-hidden]")!.textContent).toBe("0");
  });

  it("no intro line (REQ-UIX-080)", async () => {
    const c = await draw([rule("x", 5)]);
    expect(c.textContent).not.toContain("قراءة مباشرة");
  });

  it("is axe-clean", async () => {
    const { violations } = await axe.run(await draw([rule("x", 5), rule("y", 3, { enabled: false })]), { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
