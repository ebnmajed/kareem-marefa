// The head of SCR-022 as the SERVER draws it — its static state (wave 16, REQ-UIX-047, DEC-197 §7).
//
// ★★ The bar and its line state ONE fraction (the lead's 390 px finding: a fill at 10 % beside «120 من 300»).
// ★ The delta is a signed figure and reads left to right — «+120», never «120+».
// Strings are the real Arabic catalogue.
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import scoring from "@/messages/ar/scoring.json";
import recognition from "@/messages/ar/recognition.json";
import type { PointsHead as PointsHeadData } from "@/lib/dal/points";

const messages = { ...scoring, ...recognition };
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));
const { PointsHead } = await import("@/components/scoring/points-head");

const LEVEL_1 = { id: "l1", tier: 1, name: "مشارِك", threshold: 0, unlocks: [] };
const LEVEL_2 = { id: "l2", tier: 2, name: "مشارِك نشِط", threshold: 100, unlocks: ["priority_rsvp"] };

function head(over: Partial<PointsHeadData> = {}): PointsHeadData {
  return {
    totalPoints: 120,
    level: LEVEL_2,
    next: { name: "صاحب أثر", threshold: 300 },
    progress: { value: 120, max: 300 },
    streak: { enabled: true, months: 0 },
    completion: { occurrenceId: "e1", from: 0, to: 120, delta: 120, fromProgress: 0 },
    levelUp: { occurrenceId: "l2", held: LEVEL_1 },
    needsMark: false,
    mark: { entryId: "e1", total: 120, levelId: "l2" },
    ...over,
  };
}

describe("PointsHead — the static state", () => {
  it("★★ the bar's fill is the fraction its line states", async () => {
    render(await PointsHead({ head: head(), acknowledge: async () => {} }));
    const line = screen.getByText((_, el) => el?.tagName === "P" && /من/.test(el.textContent ?? "") && /صاحب أثر/.test(el.textContent ?? ""));
    const [points, threshold] = (line.textContent ?? "").match(/\d+/g)!.map(Number);
    expect([points, threshold]).toEqual([120, 300]);
    const fill = document.querySelector<HTMLElement>("[data-slot=level-bar] [data-slot=fill]")!;
    expect(fill.style.transform).toBe(`scaleX(${points / threshold})`);
  });

  it("★ the delta is isolated left to right, so the sign leads the figure", async () => {
    render(await PointsHead({ head: head(), acknowledge: async () => {} }));
    const delta = document.querySelector("[data-slot=delta] bdi[dir=ltr]")!;
    expect(delta).not.toBeNull();
    expect(delta.textContent).toBe("+120");
    expect(delta).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("120 نقطة جديدة منذ زيارتك الأخيرة")).toHaveClass("sr-only");
  });

  it("the turned card names the new level and its enabled perk, by the org's own words", async () => {
    render(await PointsHead({ head: head(), acknowledge: async () => {} }));
    const reached = screen.getByRole("group", { name: "مستوى جديد" });
    expect(reached).toHaveTextContent("مشارِك نشِط");
    expect(reached).toHaveTextContent("أولوية الحجز");
    expect(screen.getByRole("group", { name: "مستواك الحالي" })).toHaveTextContent("مشارِك");
  });

  it("at the top level the bar is full and says so", async () => {
    render(await PointsHead({ head: head({ next: null, progress: { value: 1, max: 1 }, completion: null, levelUp: null }), acknowledge: async () => {} }));
    expect(document.querySelector<HTMLElement>("[data-slot=fill]")!.style.transform).toBe("scaleX(1)");
    expect(screen.getByText("بلغت أعلى مستوى")).toBeInTheDocument();
  });

  it("no streak yet says so in words, with no flame; no streak rule draws nothing", async () => {
    const { unmount } = render(await PointsHead({ head: head(), acknowledge: async () => {} }));
    expect(screen.getByText("لا سلسلة جارية بعد")).toBeInTheDocument();
    expect(document.querySelector("[data-slot=flame]")).toBeNull();
    unmount();
    render(await PointsHead({ head: head({ streak: { enabled: false, months: 0 } }), acknowledge: async () => {} }));
    expect(screen.queryByText("لا سلسلة جارية بعد")).toBeNull();
  });
});
