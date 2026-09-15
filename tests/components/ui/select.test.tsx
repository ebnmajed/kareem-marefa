// `ui/select` — `16` §4.2, REQ-UIX-009.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import ar from "@/messages/ar/ui.json";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const CATEGORIES = ["فني", "إداري", "إبداعي", "درس من تجربة"];

function Categories(props: { invalid?: boolean }) {
  return (
    <Select aria-label="تصنيف الموضوع" name="categoryId" defaultValue="" {...props}>
      <option value="" disabled>
        اختر تصنيفًا
      </option>
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Select>
  );
}

describe("Select", () => {
  it("★ is the NATIVE control — the platform owns the indicator and the picker", () => {
    render(<Categories />);
    const select = screen.getByRole("combobox");
    expect(select.tagName).toBe("SELECT");
    // No `appearance-none`: a drawn indicator has to be POSITIONED, and a
    // positioned indicator is a physical-property decision in a bidirectional
    // product. The browser already puts its own on the correct side of a
    // dir="rtl" select. The rich searchable control is `ui/combobox`.
    expect(select.className).not.toMatch(/\bappearance-none\b/);
  });

  it("renders its options and takes a choice", async () => {
    render(<Categories />);
    const select = screen.getByRole("combobox");
    expect(screen.getAllByRole("option")).toHaveLength(CATEGORIES.length + 1);
    await userEvent.selectOptions(select, "إبداعي");
    expect(select).toHaveValue("إبداعي");
  });

  it("starts on the disabled placeholder, so nothing is chosen by accident", () => {
    render(<Categories />);
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("option", { name: "اختر تصنيفًا" })).toBeDisabled();
  });

  it("marks itself invalid with a border as well as the attribute", () => {
    render(<Categories invalid />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select.className).toContain("border-error-border");
  });

  it("takes its labelling from the Field it sits in", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <Field id="categoryId" label="تصنيف الموضوع" required error="اختر تصنيفًا لموضوعك">
          <Select name="categoryId" defaultValue="">
            <option value="">اختر تصنيفًا</option>
          </Select>
        </Field>
      </NextIntlClientProvider>,
    );
    const select = screen.getByRole("combobox");
    expect(select).toHaveAttribute("id", "categoryId");
    expect(select).toHaveAttribute("aria-required", "true");
    expect(select).toHaveAccessibleDescription("اختر تصنيفًا لموضوعك");
  });

  it("is accessible", async () => {
    const { container } = render(
      <>
        <label htmlFor="c">تصنيف الموضوع</label>
        <Select id="c" name="categoryId" defaultValue="فني">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </>,
    );
    await expectAccessible(container);
  });
});
