// The eight inline glyphs (DEC-019). What matters here is not the paths but
// the contract: decorative by default, named when asked, and mirrored in RTL
// only for the glyphs 10 §2.4 says mirror.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArrowIcon, CheckIcon, ChevronIcon, CloseIcon, DotIcon, LineIcon, PlusIcon, SpinnerIcon } from "@/components/ui/icons";

describe("icons", () => {
  it("are decorative unless given a label", () => {
    const { container } = render(<CheckIcon />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("become named images when given a label", () => {
    render(<CheckIcon label="تم" />);
    expect(screen.getByRole("img", { name: "تم" })).toBeInTheDocument();
  });

  it("chevron and arrow mirror in RTL only when pointing forward or back", () => {
    const { container } = render(
      <>
        <ChevronIcon direction="forward" />
        <ChevronIcon direction="back" />
        <ChevronIcon direction="down" />
        <ArrowIcon direction="forward" />
        <ArrowIcon direction="up" />
      </>,
    );
    const byDir = (d: string) => [...container.querySelectorAll(`svg[data-direction="${d}"]`)];
    for (const svg of byDir("forward").concat(byDir("back"))) expect(svg).toHaveClass("rtl:-scale-x-100");
    for (const svg of byDir("down").concat(byDir("up"))) expect(svg).not.toHaveClass("rtl:-scale-x-100");
  });

  it("never mirror the glyphs that must not mirror", () => {
    const { container } = render(
      <>
        <CheckIcon />
        <DotIcon />
        <LineIcon />
        <CloseIcon />
        <PlusIcon />
        <SpinnerIcon label="جارٍ التحميل" />
      </>,
    );
    for (const svg of container.querySelectorAll("svg")) expect(svg).not.toHaveClass("rtl:-scale-x-100");
  });

  it("spinner is a live status with its Arabic label", () => {
    render(<SpinnerIcon label="جارٍ التحميل" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "جارٍ التحميل");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("sizes with the text and colours with it", () => {
    const { container } = render(<PlusIcon />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "1em");
    expect(svg).toHaveAttribute("stroke", "currentColor");
  });
});
