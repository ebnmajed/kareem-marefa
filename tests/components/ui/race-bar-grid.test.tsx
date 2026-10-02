// `<RaceBar layout="grid">` — wave 20, PR B (DEC-218 §3.3, `Companies.dc.html`), add-only. The cup's table row: the
// rank, the ring, the name and «فريقك» with the bar under the name, the ranking metric's value, the other metric —
// both metrics said on every row to a screen reader (REQ-LDR-004, -005). `stacked` and `inline` are unchanged, and
// their suites pass untouched.
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import type { RaceBarProps } from "@/components/ui";
import { RaceBar } from "@/components/ui/race-bar";

const BASE: RaceBarProps = {
  companyName: "صنف",
  teamColor: "#ff9a2e",
  value: "7.3",
  metricLabel: "الترتيب حسبه: نقاط لكل عضو نشط",
  fraction: 0.73,
  rank: 3,
  rankLabel: "المرتبة 3",
  secondary: { label: "مجموع النقاط", value: "175" },
  layout: "grid",
};

function one(props: Partial<RaceBarProps> = {}) {
  return render(
    <ul>
      <RaceBar {...BASE} {...props} />
    </ul>,
  ).container;
}

describe("RaceBar — grid", () => {
  it("the rank, the name as text, the bar under it from the inline-start, both values — and both metrics heard", async () => {
    const c = one();
    const li = c.querySelector("li")!;
    expect(li.getAttribute("class")).toContain("grid-cols-");
    expect(screen.getByText("صنف").tagName).toBe("BDI");
    expect(li.querySelector<HTMLElement>("[data-slot=fill]")!.style.transform).toBe("scaleX(0.73)");
    expect(li.textContent).toContain("7.3");
    expect(li.textContent).toContain("175");
    expect(screen.getByText("الترتيب حسبه: نقاط لكل عضو نشط")).toHaveClass("sr-only");
    expect(screen.getByText("مجموع النقاط")).toHaveClass("sr-only");
    const { violations } = await axe.run(c, { rules: { "color-contrast": { enabled: false } } });
    expect(violations).toEqual([]);
  });

  it("the viewer's company is outlined and says «فريقك» in words", () => {
    const li = one({ ownLabel: "فريقك" }).querySelector("li")!;
    expect(li.textContent).toContain("فريقك");
    expect(li.getAttribute("class")).toContain("border-accent");
  });

  it("a company with no colour is its name on the neutral ring", () => {
    expect(one({ teamColor: null }).querySelector("[data-slot=ring]")!.getAttribute("class")).toContain("border-team-neutral");
  });
});
