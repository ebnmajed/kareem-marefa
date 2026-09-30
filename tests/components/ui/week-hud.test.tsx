// `<WeekHud>` — REQ-UIX-057, REQ-UIX-055, DEC-206 §4.47 – §4.49, DEC-207 W4. Three figures and the way to
// the next level, from props. ★ An absence is words, never a zero.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { render as rtlRender, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import type { WeekHudProps } from "@/components/ui";
import { WeekHud } from "@/components/ui/week-hud";

// `ui/link` resolves the locale from next-intl's context.
const Wrap = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{}}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: Parameters<typeof rtlRender>[0]) => rtlRender(ui, { wrapper: Wrap });

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const BASE: WeekHudProps = {
  label: "حصيلتك هذا الشهر",
  rank: { label: "ترتيب سبتمبر", value: "#4", valueLabel: "المرتبة 4 من 212 في سبتمبر", href: "/app/leaderboards?board=month" },
  streak: { label: "سلسلتك بالأشهر", value: "×7", valueLabel: "سلسلة 7 أشهر متتالية" },
  points: { label: "نقاطك", value: "680", valueLabel: "رصيدك 680 نقطة" },
  level: { value: 680, max: 700, line: "بقيت 20 نقطة لمستوى كريم معرفة" },
};

const slot = (c: HTMLElement, name: string) => c.querySelector(`[data-slot="${name}"]`) as HTMLElement | null;

describe("WeekHud — the figures", () => {
  it("is a named region with three tiles in the artboard's order: rank, streak, points", async () => {
    const { container } = render(<WeekHud {...BASE} />);
    const region = screen.getByRole("region", { name: "حصيلتك هذا الشهر" });
    const tiles = Array.from(region.querySelectorAll("[data-slot=rank], [data-slot=streak], [data-slot=points]")).map((t) => t.getAttribute("data-slot"));
    expect(tiles).toEqual(["rank", "streak", "points"]);
    await expectAccessible(container);
  });

  it("each figure is drawn once for the eye and heard once, as its words", () => {
    const { container } = render(<WeekHud {...BASE} />);
    const rank = slot(container, "rank")!;
    expect(within(rank).getByText("المرتبة 4 من 212 في سبتمبر")).toHaveClass("sr-only");
    const drawn = rank.querySelector("[data-slot=figure]")!;
    expect(drawn).toHaveAttribute("aria-hidden", "true");
    expect(drawn.textContent).toBe("#4");
    expect(drawn.querySelector("bdi")).toHaveAttribute("dir", "ltr");
  });

  it("the rank tile is a link to the board; a tile with no href is not", () => {
    const { container } = render(<WeekHud {...BASE} />);
    expect(slot(container, "rank")!.tagName).toBe("A");
    expect(slot(container, "rank")).toHaveAttribute("href", expect.stringContaining("/app/leaderboards?board=month"));
    expect(slot(container, "streak")!.tagName).toBe("DIV");
  });

  it("the tones are the accent, the signal and the heading ink — never a status colour", () => {
    const { container } = render(<WeekHud {...BASE} />);
    const tone = (name: string) => slot(container, name)!.querySelector("[data-slot=figure]")!.getAttribute("class")!;
    expect(tone("rank")).toContain("text-accent");
    expect(tone("streak")).toContain("text-signal");
    expect(tone("points")).toContain("text-fg-heading");
    expect(container.innerHTML).not.toMatch(/text-(?:success|error|live|ended|warning|info)\b/);
  });

  it("a rise is shown beside the rank with its words, and nothing moves", () => {
    const { container } = render(<WeekHud {...BASE} rank={{ ...(BASE.rank as object), movement: { riseLabel: "تقدّمت 3 مراكز منذ زيارتك الأخيرة" } } as WeekHudProps["rank"]} />);
    const rise = slot(container, "rise")!;
    expect(within(rise).getByText("تقدّمت 3 مراكز منذ زيارتك الأخيرة")).toHaveClass("sr-only");
    expect(rise.querySelector("svg")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/animate-|transition-(?!none)|will-change|hover:scale/);
  });

  it("the delta reads left to right beside the points, and is heard as words", () => {
    const { container } = render(<WeekHud {...BASE} points={{ ...BASE.points, delta: "+20", deltaLabel: "20 نقطة جديدة منذ زيارتك الأخيرة" }} />);
    const delta = slot(container, "delta")!;
    expect(delta.querySelector("bdi")).toHaveAttribute("dir", "ltr");
    expect(delta.querySelector("bdi")!.textContent).toBe("+20");
    expect(within(delta).getByText("20 نقطة جديدة منذ زيارتك الأخيرة")).toHaveClass("sr-only");
  });
});

describe("WeekHud — ★ absences, never zeros", () => {
  it("an unranked member's tile says why in words, and draws no «#0» and no figure", () => {
    const { container } = render(<WeekHud {...BASE} rank={{ label: "ترتيب أكتوبر", absent: "لا ترتيب بعد", href: "/app/leaderboards?board=month" }} />);
    const rank = slot(container, "rank")!;
    expect(within(rank).getByText("لا ترتيب بعد")).toBeVisible();
    expect(rank.querySelector("[data-slot=figure]")).toBeNull();
    expect(rank.textContent).not.toMatch(/#\s*0|\b0\b/);
  });

  it("an org with no streak rule has no streak tile — two tiles, nothing that reads zero", () => {
    const { container } = render(<WeekHud {...BASE} streak={null} />);
    expect(slot(container, "streak")).toBeNull();
    expect(container.querySelectorAll("[data-slot=rank], [data-slot=points]")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/×\s*0/);
  });

  it("streaks on and none running: words, never «×0»", () => {
    const { container } = render(<WeekHud {...BASE} streak={{ label: "سلسلتك بالأشهر", absent: "لم تبدأ بعد" }} />);
    expect(within(slot(container, "streak")!).getByText("لم تبدأ بعد")).toBeVisible();
    expect(container.textContent).not.toContain("×");
  });

  it("a balance of zero IS a figure, and is drawn", () => {
    const { container } = render(<WeekHud {...BASE} points={{ label: "نقاطك", value: "0", valueLabel: "رصيدك صفر نقطة" }} />);
    expect(slot(container, "points")!.querySelector("[data-slot=figure]")!.textContent).toBe("0");
  });
});

describe("WeekHud — the level", () => {
  it("the bar is decorative and the line says the value once", () => {
    const { container } = render(<WeekHud {...BASE} />);
    const bar = slot(container, "level-bar")!;
    expect(bar.querySelector("[aria-hidden=true]")).not.toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(bar.querySelector<HTMLElement>("[data-slot=fill]")!.style.transform).toBe(`scaleX(${680 / 700})`);
    expect(screen.getByText("بقيت 20 نقطة لمستوى كريم معرفة")).toBeVisible();
  });

  it("no level yet: the line alone, no bar; no level at all: nothing", () => {
    const { container, rerender } = render(<WeekHud {...BASE} level={{ line: "يُحدَّد مستواك في التقييم الليلي القادم." }} />);
    expect(slot(container, "level-bar")).toBeNull();
    expect(screen.getByText("يُحدَّد مستواك في التقييم الليلي القادم.")).toBeVisible();
    rerender(<WeekHud {...BASE} level={null} />);
    expect(container.querySelector("[data-slot=fill]")).toBeNull();
  });
});
