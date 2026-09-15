// `ui/input` — `16` §4.2, REQ-UIX-009.
//
// The control itself carries no accessibility: `<Field>` owns the label, the
// hint, the error and the aria, and the wiring between the two is proven in
// `field.test.tsx`. What is proven here is that the house input is still an
// input — that nothing in the styling has eaten a native behaviour a form
// depends on.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Input } from "@/components/ui/input";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("Input", () => {
  it("renders a real input inside an Arabic RTL document", () => {
    render(<Input aria-label="العنوان" name="title" />);
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("textbox", { name: "العنوان" }).tagName).toBe("INPUT");
  });

  it("takes what the member types", async () => {
    render(<Input aria-label="العنوان" name="title" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "كيف اختصرنا وقت إعداد التقارير");
    expect(input).toHaveValue("كيف اختصرنا وقت إعداد التقارير");
  });

  it("★ keeps the DESIGN size off the element — it is not HTML's character width", () => {
    render(<Input aria-label="العنوان" size="sm" />);
    const input = screen.getByRole("textbox");
    // `size="sm"` reaching the element would make the browser size the box in
    // characters. `InputProps` omits the native attribute for this reason.
    expect(input).not.toHaveAttribute("size");
    expect(input.className).toContain("min-h-9");
  });

  it("is 44 px at the default size, which is the touch floor", () => {
    render(<Input aria-label="العنوان" />);
    // REQ-NFR-007. `md` is the default, and `sm` is for dense console rows
    // where the row is the target — never a form a member fills in on a phone.
    expect(screen.getByRole("textbox").className).toContain("min-h-11");
  });

  it("marks itself invalid with a border as well as the attribute", () => {
    render(<Input aria-label="العنوان" invalid />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.className).toContain("border-error-border");
  });

  it("passes native attributes straight through", async () => {
    render(<Input aria-label="المدة" type="number" inputMode="numeric" min={15} max={480} step={5} dir="ltr" required />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("min", "15");
    expect(input).toHaveAttribute("max", "480");
    expect(input).toHaveAttribute("dir", "ltr");
    expect(input).toBeRequired();
  });

  it("appends the caller's className rather than replacing the house classes", () => {
    render(<Input aria-label="المدة" className="w-32 text-center" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("w-32");
    expect(input.className).toContain("rounded-field");
  });

  it("does not fire when disabled", async () => {
    render(<Input aria-label="العنوان" disabled />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "نص");
    expect(input).toHaveValue("");
  });

  it("is accessible, labelled and unlabelled-invalid alike", async () => {
    const { container } = render(
      <>
        <label htmlFor="t">العنوان</label>
        <Input id="t" name="title" />
      </>,
    );
    await expectAccessible(container);
  });
});
