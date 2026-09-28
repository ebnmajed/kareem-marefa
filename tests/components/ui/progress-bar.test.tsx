// `<ProgressBar>` — REQ-UIX-036, DEC-183, DEC-186 §5. One track, one fill, grown by `scaleX` from the
// inline start, static this wave. The components project renders in an RTL document.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { ProgressBar, progressRatio } from "@/components/ui/progress-bar";
import { contrastRatio } from "@/lib/brand/contrast";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

function fill(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-slot="fill"]') as HTMLElement;
}

describe("ProgressBar — the value", () => {
  it("is a named progressbar with its value, extent and text", () => {
    render(<ProgressBar value={320} max={500} label="مستواك" valueText="320 من 500" />);
    const bar = screen.getByRole("progressbar", { name: "مستواك" });
    expect(bar).toHaveAttribute("aria-valuenow", "320");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "500");
    expect(bar).toHaveAttribute("aria-valuetext", "320 من 500");
  });

  it.each([
    [0, 100, 0],
    [25, 100, 0.25],
    [320, 500, 0.64],
    [100, 100, 1],
    [150, 100, 1],
    [-40, 100, 0],
    [Number.NaN, 100, 0],
    [10, 0, 0],
  ])("value %s of %s scales the fill to %s", (value, max, ratio) => {
    expect(progressRatio(value, max)).toBe(ratio);
    const { container } = render(<ProgressBar value={value} max={max} label="التقدم" />);
    expect(fill(container).style.transform).toBe(`scaleX(${ratio})`);
  });

  it("clamps the announced value to the track", () => {
    render(<ProgressBar value={150} max={100} label="التقدم" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("ProgressBar — by transform, from the inline start, and still", () => {
  it("never sizes by width: the fill is the track's full width, scaled", () => {
    const { container } = render(<ProgressBar value={40} label="التقدم" />);
    expect(fill(container)).toHaveClass("w-full");
    expect(fill(container).style.width).toBe("");
  });

  it("grows from the inline start in both directions, with no bare physical origin", () => {
    const { container } = render(<ProgressBar value={40} label="التقدم" />);
    const got = fill(container).className.split(/\s+/);
    expect(got).toContain("rtl:origin-right");
    expect(got).toContain("ltr:origin-left");
    expect(got.filter((c) => /^origin-/.test(c))).toEqual([]);
  });

  it("does not move this wave: no transition and no animation (DEC-186 §4)", () => {
    const { container } = render(<ProgressBar value={40} label="التقدم" />);
    const all = `${container.firstElementChild!.className} ${fill(container).className}`;
    expect(all).not.toMatch(/transition|animate|duration/);
  });

  it("the track clips a square leading edge — no radius on the fill", () => {
    const { container } = render(<ProgressBar value={40} label="التقدم" />);
    expect(container.firstElementChild).toHaveClass("overflow-hidden", "rounded-pill", "bg-raised");
    expect(fill(container).className).not.toMatch(/rounded/);
  });
});

describe("ProgressBar — fills and sizes", () => {
  it.each([
    ["accent", "bg-accent"],
    ["signal", "bg-signal"],
    ["text", "bg-fg-heading"],
  ] as const)("fill=%s reads %s", (name, cls) => {
    const { container } = render(<ProgressBar value={50} label="التقدم" fill={name} />);
    expect(fill(container)).toHaveClass(cls);
  });

  it("a team fill writes --team on its own element", () => {
    const { container } = render(<ProgressBar value={50} label="صنف" fill="team" teamColor="#FF9A2E" />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--team")).toBe("#FF9A2E");
    expect(fill(container)).toHaveClass("bg-team");
  });

  it.each([null, undefined, "orange", "#FF9A2E;x:y"])("a team fill with no valid colour (%j) is the neutral fill and writes no style", (teamColor) => {
    const { container } = render(<ProgressBar value={50} label="شركة" fill="team" teamColor={teamColor} />);
    expect(fill(container)).toHaveClass("bg-team-neutral");
    expect(container.firstElementChild).not.toHaveAttribute("style");
  });

  it("a non-team fill ignores teamColor", () => {
    const { container } = render(<ProgressBar value={50} label="التقدم" teamColor="#FF9A2E" />);
    expect(container.firstElementChild).not.toHaveAttribute("style");
  });

  it.each([
    ["sm", "h-[3px]"],
    ["md", "h-2.5"],
  ] as const)("size=%s is %s", (size, cls) => {
    const { container } = render(<ProgressBar value={50} label="التقدم" size={size} />);
    expect(container.firstElementChild).toHaveClass(cls);
  });
});

describe("ProgressBar — decorative, and named", () => {
  it("decorative is aria-hidden with no role, so a value already in text is not read twice", () => {
    const { container } = render(<ProgressBar value={50} decorative fill="team" teamColor="#35D0FF" />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild).not.toHaveAttribute("aria-valuenow");
  });

  it("refuses to render unnamed when it is not decorative", () => {
    expect(() => render(<ProgressBar value={50} />)).toThrow(/label/);
  });

  it("is accessible in every form", async () => {
    const { container } = render(
      <div className="theme-play">
        <ProgressBar value={320} max={500} label="مستواك" valueText="320 من 500" />
        <ProgressBar value={3} max={5} label="الإطار 3 من 5" size="sm" fill="text" />
        <ProgressBar value={80} decorative fill="team" teamColor="#9B7CFF" />
        <ProgressBar value={0} label="لم يبدأ" fill="signal" />
      </div>,
    );
    await expectAccessible(container);
  });
});

describe("ProgressBar — tokens only, and contrast", () => {
  it("the file holds no hex, no literal duration and no raw palette name in its code", () => {
    const code = readFileSync(join(process.cwd(), "src/components/ui/progress-bar.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\b(?:navy|silver|slate|play)-[a-z0-9]/);
  });

  // SC 1.4.11: the fill against the track it sits on, inside the dark scope (DEC-186 §2 values).
  it.each([
    ["accent", "#c6ff3d"],
    ["signal", "#ff6e4f"],
    ["text", "#f4f1ea"],
  ])("the %s fill clears 3:1 against the raised track", (_name, hex) => {
    expect(contrastRatio(hex, "#1e2130")).toBeGreaterThanOrEqual(3);
  });
});
