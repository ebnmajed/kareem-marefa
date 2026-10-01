// `ui/week-hud` inside the playground's scope — REQ-UIX-057, REQ-UIX-050, DEC-199 §3 – §4. An RTL
// document (the `components` project), on both grounds.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { render as rtlRender } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import type { WeekHudProps } from "@/components/ui";
import { PlayScope } from "@/components/ui/scope";
import { WeekHud } from "@/components/ui/week-hud";

// `ui/link` resolves the locale from next-intl's context.
const Wrap = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{}}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: Parameters<typeof rtlRender>[0]) => rtlRender(ui, { wrapper: Wrap });

const PROPS: WeekHudProps = {
  label: "حصيلتك هذا الشهر",
  rank: { label: "ترتيب سبتمبر", value: "#4", valueLabel: "المرتبة 4", movement: { riseLabel: "تقدّمت" } },
  streak: { label: "سلسلتك بالأشهر", value: "×7", valueLabel: "سلسلة 7 أشهر" },
  points: { label: "نقاطك", value: "680", valueLabel: "رصيدك 680 نقطة", delta: "+20", deltaLabel: "20 نقطة جديدة" },
  level: { value: 680, max: 700, line: "بقيت 20 نقطة" },
};

function mount(light = false) {
  return render(
    <PlayScope light={light}>
      <WeekHud {...PROPS} />
    </PlayScope>,
  ).container;
}

describe("ui/week-hud — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in an RTL document", (light) => {
    const container = mount(light);
    expect(container.querySelector("section")!.closest(".theme-play")).not.toBeNull();
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("names semantic tokens only — no raw palette colour, no hex, no literal duration", () => {
    const html = mount().innerHTML;
    expect(html).not.toMatch(/\b(?:navy|silver|slate|gray|zinc|neutral|red|green|blue|amber)-\d/);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(html).not.toMatch(/duration-\d|\d+ms/);
  });

  it("on the light ground the accent figures take the heading ink", () => {
    const container = mount(true);
    const rank = container.querySelector("[data-slot=rank] [data-slot=figure]")!;
    expect(rank.getAttribute("class")).toContain("pg-light:text-fg-heading");
    expect(container.querySelector("[data-slot=rise]")!.getAttribute("class")).toContain("pg-light:text-fg-heading");
  });

  it("uses logical properties only — no left/right utility", () => {
    expect(mount().innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-\d|\btext-(?:left|right)\b/);
  });

  it("declares no animation, no transition and no will-change of its own", () => {
    expect(mount().innerHTML).not.toMatch(/animate-|transition-(?!none)|will-change|hover:scale/);
  });
});
