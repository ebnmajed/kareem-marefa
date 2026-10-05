// The app bar's mark — REQ-UIX-119, REQ-UIX-120.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeMark } from "@/components/shell/home-mark";
import { pendingLinkCount } from "@/components/ui/route-progress";

describe("HomeMark", () => {
  it("at rest it is the home control: it settles when pressed and does not breathe", () => {
    expect(pendingLinkCount()).toBe(0);
    const { container } = render(
      <a href="#home" aria-label="كريم معرفة">
        <HomeMark height={34} />
      </a>,
    );
    const svg = container.querySelector("svg[data-logo]")!;
    expect(svg.getAttribute("data-motion")).toBe("tap");
    // The settle is `:active > [data-logo]`, so the mark is the link's direct child.
    expect(svg.parentElement?.tagName).toBe("A");
    // The link carries the name; the drawing beside it is silent.
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("height")).toBe("34");
  });
});
