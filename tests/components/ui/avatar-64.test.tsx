// `ui/avatar` — wave 20, add-only: size 64 for the hub standing card (`Me.dc.html`, `scoring`'s request). Every other
// size is untouched; the existing suites prove that by passing as they are.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/components/ui/avatar";

describe("Avatar size 64", () => {
  it("draws 64 px with a 4 px team ring through --team", () => {
    const { container } = render(<Avatar memberId="m1" displayName="يمان" size={64} teamColor="#ff9a2e" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass("h-16", "w-16", "border-4", "border-team");
    expect(el.style.getPropertyValue("--team")).toBe("#ff9a2e");
    expect(el.textContent).toBe("ي");
  });

  it("keeps the 3 px ring on its neighbours", () => {
    const { container } = render(<Avatar memberId="m1" displayName="يمان" size={56} teamColor={null} />);
    expect(container.firstElementChild).toHaveClass("border-[3px]", "border-team-neutral");
  });
});
