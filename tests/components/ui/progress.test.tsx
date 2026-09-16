// `<Progress>` — `16` §4.2 Status. Determinate (seats, a declared size) or
// indeterminate (queued work) — omitting `value` switches modes.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Progress } from "@/components/ui/progress";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("Progress — determinate", () => {
  it("carries the accessible name, value and extent", () => {
    render(<Progress value={7} max={10} label="المقاعد المحجوزة" valueText="7 من 10" />);
    const bar = screen.getByRole("progressbar", { name: "المقاعد المحجوزة" });
    expect(bar).toHaveAttribute("aria-valuenow", "7");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "10");
    expect(bar).toHaveAttribute("aria-valuetext", "7 من 10");
  });

  it("sizes the fill to the value/max ratio", () => {
    const { container } = render(<Progress value={25} max={100} label="التقدم" />);
    const fill = container.querySelector('[role="progressbar"] > div');
    expect(fill).toHaveStyle({ width: "25%" });
  });

  it("clamps out-of-range values to the track", () => {
    const { container } = render(<Progress value={150} max={100} label="التقدم" />);
    const fill = container.querySelector('[role="progressbar"] > div');
    expect(fill).toHaveStyle({ width: "100%" });
  });
});

describe("Progress — indeterminate", () => {
  it("carries no aria-valuenow and pulses, gated behind motion-safe", () => {
    const { container } = render(<Progress label="جارٍ التحقق" />);
    const bar = screen.getByRole("progressbar", { name: "جارٍ التحقق" });
    expect(bar).not.toHaveAttribute("aria-valuenow");
    const fill = container.querySelector('[role="progressbar"] > div');
    expect(fill).toHaveClass("motion-safe:animate-pulse");
  });
});

describe("Progress — tone", () => {
  it.each([
    ["success", "bg-success"],
    ["live", "bg-live"],
    ["ended", "bg-ended"],
    ["error", "bg-error"],
  ] as const)("%s fills with %s", (tone, cls) => {
    const { container } = render(<Progress value={50} label="حالة" tone={tone} />);
    expect(container.querySelector('[role="progressbar"] > div')).toHaveClass(cls);
  });
});

describe("Progress — axe", () => {
  it("is accessible determinate and indeterminate", async () => {
    const determinate = render(<Progress value={5} max={10} label="المقاعد" />);
    await expectAccessible(determinate.container);
    determinate.unmount();
    const indeterminate = render(<Progress label="جارٍ" />);
    await expectAccessible(indeterminate.container);
  });
});
