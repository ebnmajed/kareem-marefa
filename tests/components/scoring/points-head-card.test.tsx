// SCR-022's head card rebuilt (wave 20, REQ-UIX-072, REQ-UIX-047, DEC-218 §3.1). Re-homes the retired `points-head`
// cases. ★ The bar is the fraction its line states; the delta reads left to right; the level row TURNS IN PLACE —
// both faces drawn and named; at the top the bar is full.
import { act, render, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import scoring from "@/messages/ar/scoring.json";
import type { PointsHead } from "@/lib/dal/points";
import { resetPaintedForTests } from "@/components/scoring/use-seen-moment";
import { resetMomentsForTests } from "@/lib/ui/moment";
import { fakeAnimate, removeFakeAnimate, setDurationTokens, setReducedMotion } from "../lib-ui/motion-env";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages: scoring, namespace: namespace as never }),
}));

const { PointsHeadCard } = await import("@/components/scoring/points-head-card");

const L3 = { id: "l3", tier: 3, name: "صاحب أثر", threshold: 300, unlocks: [] };
const L4 = { id: "l4", tier: 4, name: "كريم معرفة", threshold: 700, unlocks: [] };

function head(over: Partial<PointsHead> = {}): PointsHead {
  return {
    totalPoints: 730,
    level: L4,
    next: { name: "سفير المعرفة", threshold: 2000 },
    progress: { value: 730, max: 2000 },
    streak: { enabled: true, months: 8 },
    completion: null,
    levelUp: null,
    needsMark: false,
    mark: { entryId: "e", total: 730, levelId: "l4" },
    seen: { entryId: "e", total: 730, levelId: "l4" },
    ...over,
  };
}

async function draw(h: PointsHead) {
  const ui = await PointsHeadCard({ head: h, acknowledge: async () => {} });
  return render(<>{ui}</>).container;
}

beforeEach(() => {
  resetMomentsForTests();
  resetPaintedForTests();
  setReducedMotion(true);
});
afterEach(() => setReducedMotion(false));

describe("PointsHeadCard — the static state", () => {
  it("«رصيدك» and the balance as the page's one strong; the level and «next» بعد N", async () => {
    const c = await draw(head());
    expect(c.querySelectorAll("strong")).toHaveLength(1);
    expect(c.querySelector("strong")!.textContent).toBe("730");
    expect(c.textContent).toContain("رصيدك");
    expect(c.textContent).toContain("كريم معرفة");
    expect(c.textContent).toContain("«سفير المعرفة» بعد 1,270");
  });

  it("★★ the bar's fill is the fraction its line states — threshold − balance is the N in the line", async () => {
    const c = await draw(head());
    const fill = c.querySelector("[data-slot=level-bar] [data-slot=fill]") as HTMLElement;
    expect(fill.style.transform).toBe(`scaleX(${730 / 2000})`);
  });

  it("★ the delta is isolated left to right, so the sign leads the figure", async () => {
    const c = await draw(head({ completion: { occurrenceId: "e", from: 680, to: 730, delta: 50, fromProgress: 0.34 } }));
    const bdi = c.querySelector("[data-slot=delta] bdi")!;
    expect(bdi.getAttribute("dir")).toBe("ltr");
    expect(bdi.textContent).toBe("+50");
  });

  it("★★ moment 4's end frame: the level row turns in place — both faces drawn and named, the reached one showing", async () => {
    const c = await draw(head({ levelUp: { occurrenceId: "l4", held: L3 } }));
    const flip = c.querySelector("[data-layout=flip]")!;
    expect(flip.querySelector("[data-slot=flip-inner]")!.getAttribute("class")).toContain("rotate-y-180");
    expect(within(c).getByRole("group", { name: "مستواك الحالي" }).textContent).toContain("صاحب أثر");
    expect(within(c).getByRole("group", { name: "مستوى جديد" }).textContent).toContain("كريم معرفة");
    expect(flip.querySelector("[data-slot=shine]")!.getAttribute("class")).not.toContain("moment-shine");
  });

  it("at the top level the bar is full and says so", async () => {
    const c = await draw(head({ next: null, progress: { value: 1, max: 1 } }));
    expect((c.querySelector("[data-slot=level-bar] [data-slot=fill]") as HTMLElement).style.transform).toBe("scaleX(1)");
    expect(c.textContent).toContain("بلغت أعلى مستوى");
  });

  it("no level yet: words, no bar", async () => {
    const c = await draw(head({ level: null, next: null, progress: null }));
    expect(c.querySelector("[data-slot=level-bar]")).toBeNull();
    expect(c.textContent).toContain("يُحدَّد مستواك");
  });

  it("draws no streak — it lives on the standing card", async () => {
    expect((await draw(head())).querySelector("[data-slot=flame]")).toBeNull();
  });
});

describe("★ the hidden copy (from lg the head is lg:hidden and the band holds the same occurrence)", () => {
  it("claims nothing, animates nothing and acknowledges nothing until it is displayed", async () => {
    setReducedMotion(false);
    setDurationTokens({ fast: "120ms", base: "220ms", slow: "420ms", party: "900ms" });
    const made = fakeAnimate();
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      configurable: true,
      get(this: HTMLElement) {
        return this.closest("[data-hidden-copy]") ? null : document.body;
      },
    });
    const acknowledge = vi.fn(async () => {});
    const ui = await PointsHeadCard({ head: head({ completion: { occurrenceId: "e-new", from: 680, to: 730, delta: 50, fromProgress: 0.34 }, needsMark: true }), acknowledge });
    const { container } = render(<div data-hidden-copy="">{ui}</div>);
    await act(async () => {
      await Promise.resolve();
    });
    expect(made).toHaveLength(0);
    expect(acknowledge).not.toHaveBeenCalled();
    expect(container.querySelector("[data-moment-copy]")).toHaveAttribute("data-moment-copy", "hidden");
    removeFakeAnimate();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).offsetParent;
  });
});
