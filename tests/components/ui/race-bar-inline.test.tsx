// `<RaceBar layout="inline">` — wave 18 (DEC-207 W3), add-only. The home's race: one line a company. The
// metric is still said on every row (REQ-LDR-005), to a screen reader; `stacked` is unchanged, and
// `race-bar.test.tsx` passes untouched.
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import type { RaceBarProps } from "@/components/ui";
import { RaceBar } from "@/components/ui/race-bar";

const BASE: RaceBarProps = { companyName: "صنف", teamColor: "#ff9a2e", value: "7.3", metricLabel: "نقاط لكل عضو نشِط", fraction: 0.71, layout: "inline" };

function one(props: Partial<RaceBarProps> = {}) {
  return render(
    <ul>
      <RaceBar {...BASE} {...props} />
    </ul>,
  ).container;
}

describe("RaceBar — inline", () => {
  it("draws the ring, the name, the bar and the value on one row, the name as text", async () => {
    const c = one();
    const li = c.querySelector("li")!;
    expect(Array.from(li.children).map((el) => el.getAttribute("data-slot") ?? el.tagName)).toEqual(["ring", "SPAN", "DIV", "SPAN"]);
    expect(screen.getByText("صنف").tagName).toBe("BDI");
    expect(li.querySelector<HTMLElement>("[data-slot=fill]")!.style.transform).toBe("scaleX(0.71)");
    const { violations } = await axe.run(c, { rules: { "color-contrast": { enabled: false } } });
    expect(violations).toEqual([]);
  });

  it("★ the metric is still said on every row, to a screen reader", () => {
    const li = one().querySelector("li")!;
    expect(within(li).getByText("نقاط لكل عضو نشِط")).toHaveClass("sr-only");
  });

  it("the own company is outlined and says so in words", () => {
    const li = one({ ownLabel: "فريقك" }).querySelector("li")!;
    expect(li.getAttribute("class")).toContain("border-accent");
    expect(within(li).getByText("فريقك")).toBeVisible();
  });

  it("a rank is heard, not drawn", () => {
    const li = one({ rank: 2, rankLabel: "المركز 2" }).querySelector("li")!;
    expect(within(li).getByText("المركز 2")).toHaveClass("sr-only");
  });

  it("a negative value draws an empty track and keeps its sign", () => {
    const li = one({ fraction: -0.2, value: "‎-0.4" }).querySelector("li")!;
    expect(li.querySelector<HTMLElement>("[data-slot=fill]")!.style.transform).toBe("scaleX(0)");
    expect(li.textContent).toContain("-0.4");
  });

  it("the default is stacked — the metric visible under the bar, as before", () => {
    const c = render(
      <ul>
        <RaceBar {...BASE} layout={undefined} />
      </ul>,
    ).container;
    expect(within(c.querySelector("li")!).getByText("نقاط لكل عضو نشِط")).not.toHaveClass("sr-only");
  });
});
