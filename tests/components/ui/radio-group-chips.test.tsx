// `ui/radio-group`'s wave-19 additions (DEC-214 §5) — add-only: `appearance="chips"` and `required`. The rows
// appearance and every existing caller are proven unchanged by `radio-group.test.tsx`, which this file does not touch.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { RadioGroup } from "@/components/ui/radio-group";

const LEVELS = [
  { value: "introductory", label: "تمهيدي" },
  { value: "intermediate", label: "متوسط" },
  { value: "advanced", label: "متقدم" },
];

function chips(extra: { required?: boolean; requiredLabel?: string } = {}) {
  return render(
    <form dir="rtl">
      <RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} defaultValue="introductory" appearance="chips" {...extra} />
    </form>,
  );
}

describe("RadioGroup — chips", () => {
  it("keeps three real radios in one named group, the default checked", () => {
    chips();
    const group = screen.getByRole("radiogroup", { name: "مستوى الجلسة" });
    expect(group.querySelector('[data-appearance="chips"]')).not.toBeNull();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(["introductory", "intermediate", "advanced"]);
    expect(screen.getByRole("radio", { name: "تمهيدي" })).toBeChecked();
  });

  it("a press on a chip's word checks its radio, and the form posts it", () => {
    const { container } = chips();
    fireEvent.click(screen.getByText("متقدم"));
    expect(screen.getByRole("radio", { name: "متقدم" })).toBeChecked();
    expect(new FormData(container.querySelector("form") as HTMLFormElement).get("level")).toBe("advanced");
  });

  it("the radio is hidden visually, never removed — the chip draws the checked state and the focus", () => {
    chips();
    const radio = screen.getByRole("radio", { name: "متوسط" });
    expect(radio).toHaveClass("sr-only");
    expect(radio.closest("label")?.className).toMatch(/has-\[:checked\]:bg-accent/);
    expect(radio.closest("label")?.className).toMatch(/has-\[:focus-visible\]:outline/);
  });

  it("★ required: «مطلوب» after the legend and aria-required on the group (REQ-UIX-011)", () => {
    chips({ required: true, requiredLabel: "مطلوب" });
    const group = screen.getByRole("radiogroup", { name: /مستوى الجلسة/ });
    expect(group).toHaveAttribute("aria-required", "true");
    expect(group.querySelector("legend")).toHaveTextContent("مستوى الجلسة مطلوب");
  });

  it("not required: neither the word nor the attribute", () => {
    chips();
    const group = screen.getByRole("radiogroup");
    expect(group).not.toHaveAttribute("aria-required");
    expect(group.querySelector("legend")).toHaveTextContent(/^مستوى الجلسة$/);
  });

  it("is accessible", async () => {
    const { container } = chips({ required: true, requiredLabel: "مطلوب" });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
