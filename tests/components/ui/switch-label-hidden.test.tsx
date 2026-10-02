// `ui/switch`'s `labelHidden` — wave 22 (DEC-232 §6, REQ-UIX-092), add-only: a switch in a `data-table` cell.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "@/components/ui/switch";

describe("Switch labelHidden", () => {
  it("keeps the label as the accessible name while not drawing it", () => {
    render(<Switch label="تعليق على جلسة" labelHidden checked onCheckedChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "تعليق على جلسة" });
    expect(sw).toBeChecked();
    expect(screen.getByText("تعليق على جلسة").className).toBe("sr-only");
  });

  it("still toggles from the drawn track", async () => {
    const onChange = vi.fn();
    render(<Switch label="التذكير" labelHidden checked={false} onCheckedChange={onChange} />);
    await userEvent.click(screen.getByRole("switch", { name: "التذكير" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("draws the label as before when the prop is absent", () => {
    render(<Switch label="التذكير" />);
    expect(screen.getByText("التذكير").className).not.toContain("sr-only");
  });
});
