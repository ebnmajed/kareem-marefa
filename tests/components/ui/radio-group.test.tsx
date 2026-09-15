// `ui/radio-group` — `16` §4.2, REQ-UIX-009, REQ-UIX-010, REQ-NFR-007.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { FormSummary } from "@/components/ui/form-summary";
import { RadioGroup } from "@/components/ui/radio-group";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const LEVELS = [
  { value: "introductory", label: "تمهيدي" },
  { value: "intermediate", label: "متوسط" },
  { value: "advanced", label: "متقدم" },
];

describe("RadioGroup", () => {
  it("★ is named by its legend — the question is part of the group, not a paragraph above it", () => {
    render(<RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} />);
    // Without this a screen reader reads «تمهيدي، زر اختيار، ١ من ٣» and the
    // member never hears what is being asked.
    expect(screen.getByRole("radiogroup", { name: "مستوى الجلسة" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("starts on the default and moves with the arrow keys", async () => {
    render(<RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} defaultValue="introductory" />);
    expect(screen.getByRole("radio", { name: "تمهيدي" })).toBeChecked();
    screen.getByRole("radio", { name: "تمهيدي" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "متوسط" })).toBeChecked();
  });

  it("works as a controlled group", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} value="introductory" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "متقدم" }));
    expect(onChange).toHaveBeenCalledWith("advanced");
    // Nothing moves until the owner says so.
    expect(screen.getByRole("radio", { name: "تمهيدي" })).toBeChecked();
    rerender(<RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} value="advanced" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "متقدم" })).toBeChecked();
  });

  it("describes an option that carries a hint", () => {
    render(
      <RadioGroup
        name="level"
        legend="مستوى الجلسة"
        options={[{ value: "introductory", label: "تمهيدي", hint: "لا يفترض معرفة سابقة" }, ...LEVELS.slice(1)]}
      />,
    );
    expect(screen.getByRole("radio", { name: "تمهيدي" })).toHaveAccessibleDescription("لا يفترض معرفة سابقة");
    expect(screen.getByRole("radio", { name: "متوسط" })).not.toHaveAccessibleDescription();
  });

  it("marks the GROUP invalid, which is where the failure belongs", () => {
    render(<RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} invalid />);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-invalid", "true");
  });

  it("skips a disabled option and keeps every row at the 44 px floor", async () => {
    render(<RadioGroup name="level" legend="مستوى الجلسة" options={[{ ...LEVELS[0], disabled: true }, ...LEVELS.slice(1)]} />);
    const disabled = screen.getByRole("radio", { name: "تمهيدي" });
    await userEvent.click(disabled);
    expect(disabled).not.toBeChecked();
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.closest("label")?.className).toContain("min-h-11");
    }
  });

  it("posts the chosen value under the group's name", async () => {
    render(
      <form>
        <RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} />
      </form>,
    );
    await userEvent.click(screen.getByRole("radio", { name: "متوسط" }));
    expect(new FormData(document.querySelector("form")!).get("level")).toBe("intermediate");
  });

  it("★ a summary link reaches it — the fieldset carries id={name} and focus lands on the first radio", async () => {
    render(
      <form noValidate>
        <FormSummary title="تعذّر إرسال النموذج" errors={[{ fieldId: "level", label: "المستوى", message: "اختر مستوى الجلسة" }]} />
        <RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} />
      </form>,
    );
    expect(document.getElementById("level")?.tagName).toBe("FIELDSET");
    await userEvent.click(screen.getByRole("link", { name: /المستوى/ }));
    // A <fieldset> is not focusable, so focus() on it would do nothing and the
    // member would be left where they were.
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "تمهيدي" }));
  });

  it("is accessible, plain and failed", async () => {
    const { container } = render(
      <>
        <RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} />
        <RadioGroup name="audience" legend="الفئة المستهدفة" options={LEVELS.map((l) => ({ ...l, hint: "وصف" }))} invalid />
      </>,
    );
    await expectAccessible(container);
  });
});
