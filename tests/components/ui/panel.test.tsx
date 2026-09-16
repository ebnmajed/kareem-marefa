// `<Panel>` — `16` §4.2 Surface. A bordered region that is not a card.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Panel } from "@/components/ui/panel";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("Panel", () => {
  it("renders its children and defaults to the neutral tone", () => {
    const { container } = render(<Panel>محتوى</Panel>);
    expect(screen.getByText("محتوى")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("border-edge", "bg-surface");
  });

  it.each([
    ["success", "bg-success-bg"],
    ["live", "bg-live-bg"],
    ["ended", "bg-ended-bg"],
    ["error", "bg-error-bg"],
  ] as const)("tone=%s carries %s", (tone, cls) => {
    const { container } = render(<Panel tone={tone}>محتوى</Panel>);
    expect(container.firstElementChild).toHaveClass(cls);
  });

  it("keeps the caller's extra class", () => {
    const { container } = render(<Panel className="extra">محتوى</Panel>);
    expect(container.firstElementChild).toHaveClass("extra");
  });

  it("is accessible", async () => {
    const { container } = render(<Panel tone="error">تعذّر إكمال العملية.</Panel>);
    await expectAccessible(container);
  });
});
