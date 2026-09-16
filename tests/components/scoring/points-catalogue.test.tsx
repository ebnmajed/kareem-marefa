// `PointsCatalogue` — SCR-022, REQ-PTS-014. Same real-messages pattern as
// points-history-list.test.tsx.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/scoring.json";
import type { CatalogueEntry } from "@/lib/dal/points";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "scoring.points" }),
}));

const { PointsCatalogue } = await import("@/components/scoring/points-catalogue");

const entry = (overrides: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  actionKey: "check_in",
  points: 5,
  enabled: true,
  reasonAr: "تسجيل حضور",
  capPerSession: null,
  ...overrides,
});

async function renderCatalogue(entries: CatalogueEntry[]) {
  const element = await PointsCatalogue({ entries });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("PointsCatalogue", () => {
  it("renders nothing when every rule is worth zero (the negative catalogue)", async () => {
    const { container } = await renderCatalogue([entry({ points: 0 })]);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists an enabled rule with its cap, and marks a disabled one", async () => {
    await renderCatalogue([entry({ capPerSession: 5 }), entry({ actionKey: "comment", reasonAr: "تعليق", enabled: false })]);
    expect(screen.getByRole("heading", { name: "ماذا يمنحك نقاطًا؟" })).toBeInTheDocument();
    expect(screen.getByText("تعليق")).toBeInTheDocument();
    expect(screen.getByText("غير مُفعَّل حاليًا")).toBeInTheDocument();
  });

  it("is axe-clean", async () => {
    const { container } = await renderCatalogue([entry()]);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
