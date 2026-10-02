// «بلا ترتيب» on the home's race (wave 20, PR C, REQ-UIX-082, the lead's ruling 2): a company below its snapshot's
// frozen minimum has no rank on the home either — two surfaces never disagree about one company's rank.
import { within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import scoring from "@/messages/ar/scoring.json";
import type { CompanyRace } from "@/lib/dal/leaderboards";
import { companyRace, renderIntl } from "./week-fixture";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages: scoring, namespace: namespace as never }),
}));
let race: CompanyRace | null = companyRace();
vi.mock("@/lib/dal/leaderboards", () => ({ getCompanyRace: async () => race }));

const { CompanyRaceCard } = await import("@/components/scoring/company-race-card");

describe("CompanyRaceCard — «بلا ترتيب»", () => {
  it("★ the own company below the minimum says «بلا ترتيب» and is heard with no rank", async () => {
    const base = companyRace();
    race = { ...base, rows: base.rows.map((r) => (r.isOwn ? { ...r, unranked: true } : r)) };
    const c = renderIntl((await CompanyRaceCard({ locale: "ar" }))!).container;
    const own = c.querySelectorAll("li")[2];
    expect(within(own as HTMLElement).getByText("بلا ترتيب")).toBeTruthy();
    expect(own.textContent).not.toContain("المرتبة");
  });

  it("an eligible company keeps its rank, heard", async () => {
    race = companyRace();
    const c = renderIntl((await CompanyRaceCard({ locale: "ar" }))!).container;
    expect(c.textContent).not.toContain("بلا ترتيب");
  });
});
