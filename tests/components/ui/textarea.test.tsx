// `ui/textarea` — `16` §4.2, REQ-UIX-009, `10` §1.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import ar from "@/messages/ar/ui.json";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("Textarea", () => {
  it("keeps a long Arabic abstract exactly as it was typed", async () => {
    render(<Textarea aria-label="النبذة" name="abstract" />);
    const area = screen.getByRole("textbox");
    await userEvent.type(area, "شرحٌ للفكرة\nومن سيستفيد منها");
    expect(area).toHaveValue("شرحٌ للفكرة\nومن سيستفيد منها");
  });

  it("opens at five rows, and takes another count when asked", () => {
    const { rerender } = render(<Textarea aria-label="النبذة" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "5");
    rerender(<Textarea aria-label="الملاحظات" rows={3} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "3");
  });

  it("★ keeps the long-form floor only when no row count was asked for", () => {
    // The composer asks for three rows and grows; an 8rem floor would make its
    // first line sit in a box twice the height it asked for, and a `min-h-*`
    // passed in cannot win against it reliably (emit order, DEC-111).
    const { rerender } = render(<Textarea aria-label="النبذة" />);
    expect(screen.getByRole("textbox").className).toContain("min-h-32");
    rerender(<Textarea aria-label="تعليق" rows={3} />);
    expect(screen.getByRole("textbox").className).not.toContain("min-h-32");
  });

  it("★ never clips its own text — `overflow: hidden` cuts tashkeel", () => {
    render(<Textarea aria-label="النبذة" />);
    const area = screen.getByRole("textbox");
    // `10` §1: never `overflow: hidden` on a text line. A textarea SCROLLS,
    // which is a different thing; what it must never gain is a fixed height
    // with hidden overflow «to keep the form tidy».
    expect(area.className).not.toMatch(/\boverflow-hidden\b/);
    expect(area.className).toContain("min-h-32");
  });

  it("marks itself invalid with a border as well as the attribute", () => {
    render(<Textarea aria-label="النبذة" invalid />);
    const area = screen.getByRole("textbox");
    expect(area).toHaveAttribute("aria-invalid", "true");
    expect(area.className).toContain("border-error-border");
  });

  it("takes its labelling from the Field it sits in", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <Field id="abstract" label="نبذة عن موضوعك" hint="اشرح فكرتك ومن سيستفيد منها" error="فضلًا اكتب نبذة قصيرة">
          <Textarea name="abstract" maxLength={2000} />
        </Field>
      </NextIntlClientProvider>,
    );
    const area = screen.getByRole("textbox");
    expect(area).toHaveAttribute("id", "abstract");
    expect(area).toHaveAttribute("maxlength", "2000");
    expect(area).toHaveAttribute("aria-invalid", "true");
    expect(area).toHaveAccessibleDescription("فضلًا اكتب نبذة قصيرة اشرح فكرتك ومن سيستفيد منها");
  });

  it("is accessible", async () => {
    const { container } = render(
      <>
        <label htmlFor="a">النبذة</label>
        <Textarea id="a" name="abstract" />
      </>,
    );
    await expectAccessible(container);
  });
});
