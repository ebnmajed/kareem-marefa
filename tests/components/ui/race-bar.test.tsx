// `<RaceBar>` — REQ-UIX-038, REQ-LDR-004, REQ-LDR-005, DEC-186 §7. A company by
// its colour AND its name; the ranking metric marked; nothing moves.
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { RaceBarProps } from "@/components/ui";
import { RaceBar } from "@/components/ui/race-bar";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const BASE: RaceBarProps = {
  companyName: "صنف",
  teamColor: "#ff9a2e",
  value: "7.3",
  metricLabel: "نقاط لكل عضو نشِط",
  fraction: 0.71,
};

function one(props: RaceBarProps) {
  return render(
    <ul>
      <RaceBar {...props} />
    </ul>,
  );
}

const fillOf = (c: HTMLElement) => c.querySelector('[data-slot="fill"]') as HTMLElement;
const ringOf = (c: HTMLElement) => c.querySelector('[data-slot="ring"]') as HTMLElement;

describe("RaceBar — the company, by name as well as colour", () => {
  it("draws the name as text, isolated, beside a ring carrying --team", () => {
    const { container } = one(BASE);
    const name = screen.getByText("صنف");
    expect(name.tagName).toBe("BDI");
    expect(name).toBeVisible();
    expect(ringOf(container).style.getPropertyValue("--team")).toBe("#ff9a2e");
    expect(ringOf(container)).toHaveClass("border-team");
    expect(ringOf(container)).toHaveAttribute("aria-hidden", "true");
  });

  it("★ two companies with the SAME colour are still told apart, by their names", () => {
    render(
      <ul>
        <RaceBar {...BASE} companyName="مواهب" teamColor="#35d0ff" />
        <RaceBar {...BASE} companyName="جذر" teamColor="#35d0ff" />
      </ul>,
    );
    const [a, b] = screen.getAllByRole("listitem");
    expect(within(a).getByText("مواهب")).toBeVisible();
    expect(within(b).getByText("جذر")).toBeVisible();
  });

  it("a company with no colour — or a malformed one — gets the neutral ring and fill, and its name", () => {
    for (const teamColor of [null, "red; background: url(x)", "#fff"]) {
      const { container, unmount } = one({ ...BASE, teamColor });
      expect(container.innerHTML).not.toContain("--team");
      expect(ringOf(container)).toHaveClass("border-team-neutral");
      expect(fillOf(container)).toHaveClass("bg-team-neutral");
      expect(screen.getByText("صنف")).toBeVisible();
      unmount();
    }
  });
});

describe("RaceBar — the value and the metric", () => {
  it("★ marks the ranking metric visibly, under a signed-safe value (REQ-LDR-005)", () => {
    one(BASE);
    expect(screen.getByText("نقاط لكل عضو نشِط")).not.toHaveClass("sr-only");
    const value = screen.getByText("7.3");
    expect(value.tagName).toBe("BDI");
    expect(value).toHaveAttribute("dir", "ltr");
  });

  it("the bar is decorative: the number is read once, as text", () => {
    const { container } = one(BASE);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(fillOf(container).parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("listitem").textContent).toBe("صنف7.3نقاط لكل عضو نشِط");
  });

  it("carries the other metric, quieter, when given (REQ-LDR-004)", () => {
    one({ ...BASE, secondary: { label: "إجمالي النقاط", value: "1,204" } });
    expect(screen.getByText("إجمالي النقاط")).toBeInTheDocument();
    expect(screen.getByText("1,204")).toHaveAttribute("dir", "ltr");
  });

  it("reads the rank as a sentence and shows it in Western digits", () => {
    one({ ...BASE, rank: 3, rankLabel: "المركز 3" });
    expect(screen.getByText("المركز 3")).toHaveClass("sr-only");
    expect(screen.getByText("3")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("listitem").textContent?.startsWith("المركز 3")).toBe(true);
  });
});

describe("RaceBar — the fill", () => {
  it.each([
    [0.71, "scaleX(0.71)"],
    [0, "scaleX(0)"],
    [1, "scaleX(1)"],
    [1.4, "scaleX(1)"],
    [-0.2, "scaleX(0)"],
    [Number.NaN, "scaleX(0)"],
  ])("fraction %s → %s", (fraction, transform) => {
    const { container } = one({ ...BASE, fraction });
    expect(fillOf(container).style.transform).toBe(transform);
  });

  it("★ a negative company keeps its signed number beside an empty track", () => {
    const { container } = one({ ...BASE, value: "‎-12", fraction: -0.1 });
    expect(fillOf(container).style.transform).toBe("scaleX(0)");
    expect(screen.getByText("‎-12")).toBeInTheDocument();
  });

  it("grows from the inline start in both directions", () => {
    const { container } = one(BASE);
    expect(fillOf(container)).toHaveClass("rtl:origin-right", "ltr:origin-left");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
  });
});

describe("RaceBar — the viewer's own company", () => {
  it("★ is outlined AND named in words", () => {
    one({ ...BASE, ownLabel: "فريقك" });
    expect(screen.getByText("فريقك")).not.toHaveClass("sr-only");
    expect(screen.getByRole("listitem").className).toContain("border-accent");
  });

  it("another company is not outlined", () => {
    one(BASE);
    expect(screen.getByRole("listitem").className).not.toContain("border-accent");
  });

  it("has no axe violations — plain, ranked, own, secondary", async () => {
    const { container } = render(
      <ul>
        <RaceBar {...BASE} />
        <RaceBar {...BASE} companyName="مواهب" rank={1} rankLabel="المركز 1" ownLabel="فريقك" secondary={{ label: "إجمالي النقاط", value: "2,310" }} />
      </ul>,
    );
    await expectAccessible(container);
  });
});

describe("RaceBar — the source", () => {
  it("★ nothing moves (DEC-186 §4), and no physical direction", () => {
    const source = readFileSync("src/components/ui/race-bar.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    expect(source).not.toMatch(/\btransition|\banimate-|@keyframes|\.animate\(/);
    expect(source).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-|text-left|text-right/);
    expect(source).not.toMatch(/overflow-hidden|truncate/);
  });
});
