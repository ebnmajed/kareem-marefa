// `<Field>` — the only wrapper. `16` §8.2 items 1–3, REQ-UIX-009, REQ-UIX-011.
//
// What is being proven is not that it renders: it is that a screen CANNOT get
// the wiring wrong. Every assertion below is something fourteen screens each
// hand-wrote and at least one of them got wrong.
//
// The strings come from the REAL `ar/ui.json`, so a renamed key fails here
// rather than in production — the pattern `tests/components/checkin` set.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import ar from "@/messages/ar/ui.json";

const REQUIRED = ar.ui.field.required;

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      {children}
    </NextIntlClientProvider>
  );
}

// jsdom has no layout engine, so `color-contrast` cannot be evaluated here and
// only produces "incomplete" results plus a stream of getComputedStyle
// warnings. Contrast is asserted where there is a real renderer —
// `tests/e2e/a11y.spec.ts`, through @axe-core/playwright.
async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("Field — the label", () => {
  it("associates the label with the control it wraps, with no id from the caller", () => {
    render(
      <Wrap>
        <Field label="عنوان الموضوع">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    const input = screen.getByLabelText("عنوان الموضوع");
    expect(input).toHaveAttribute("name", "title");
    // The generated id reaches both halves — that is what `htmlFor` needs.
    expect(input.id).toBeTruthy();
    expect(document.querySelector(`label[for="${input.id}"]`)).toBeInTheDocument();
  });

  it("uses the caller's id when one is given", () => {
    render(
      <Wrap>
        <Field id="title" label="عنوان الموضوع">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    expect(screen.getByLabelText("عنوان الموضوع")).toHaveAttribute("id", "title");
  });
});

describe("Field — required, marked positively", () => {
  it("marks required with «مطلوب» on the label and never with an asterisk", () => {
    const { container } = render(
      <Wrap>
        <Field label="عنوان الموضوع" required>
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();
    expect(REQUIRED).toBe("مطلوب");
    // ★ REQ-UIX-011: an asterisk collides with the RTL run. Not «*», not «★».
    expect(container.textContent).not.toMatch(/[*٭]/);
  });

  it("sets aria-required on the control, so the fact is programmatic too", () => {
    render(
      <Wrap>
        <Field label="عنوان الموضوع" required>
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-required", "true");
  });

  it("says nothing at all when the field is optional — the absence is the signal", () => {
    render(
      <Wrap>
        <Field label="الفئة المستهدفة">
          <Input name="targetAudience" />
        </Field>
      </Wrap>,
    );
    expect(screen.queryByText(REQUIRED)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-required");
  });

  it("★ puts the marker IN the accessible name, which is what callers must query on", () => {
    render(
      <Wrap>
        <Field label="عنوان الموضوع" required>
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    // The marker is not aria-hidden, deliberately: `htmlFor` is the one piece
    // of wiring that survives a raw <input> being dropped in here, where the
    // context reaches nothing. The cost is this — an exact-match query on the
    // label alone does not find the control.
    expect(screen.queryByLabelText("عنوان الموضوع")).not.toBeInTheDocument();
    expect(screen.getByLabelText(`عنوان الموضوع ${REQUIRED}`)).toBeInTheDocument();
    expect(screen.getByLabelText("عنوان الموضوع", { exact: false })).toBeInTheDocument();
  });
});

describe("Field — the hint and the error", () => {
  it("describes the control with the hint", () => {
    render(
      <Wrap>
        <Field label="عنوان الموضوع" hint="مثال: كيف اختصرنا وقت إعداد التقارير">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription("مثال: كيف اختصرنا وقت إعداد التقارير");
  });

  it("marks the control invalid and describes it with the message", () => {
    render(
      <Wrap>
        <Field label="عنوان الموضوع" error="فضلًا أدخل عنوان موضوعك">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("فضلًا أدخل عنوان موضوعك");
  });

  it("reads the error BEFORE the hint when both are present", () => {
    render(
      <Wrap>
        <Field label="عنوان الموضوع" hint="مثال قصير" error="العنوان قصير جدًا">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    // The problem comes before the advice: focus has just been sent here.
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription("العنوان قصير جدًا مثال قصير");
  });

  it("carries the error on three channels, never on colour alone", () => {
    const { container } = render(
      <Wrap>
        <Field label="عنوان الموضوع" error="العنوان قصير جدًا">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    // 1 — the message, in words.
    expect(screen.getByText("العنوان قصير جدًا")).toBeInTheDocument();
    // 2 — the glyph beside it.
    expect(container.querySelector("p.text-error svg")).toBeInTheDocument();
    // 3 — a 1 px error border on the control, and the neutral one is gone.
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-error-border");
    expect(input.className).not.toContain("border-edge-strong");
  });

  it("★ does NOT announce the field error — the summary is the announcement", () => {
    render(
      <Wrap>
        <Field label="عنوان الموضوع" error="العنوان قصير جدًا">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    // The day-one stub had role="alert" here. With <FormSummary> also
    // role="alert", a six-error submission would announce seven times. This
    // message is in aria-describedby, so it is read when focus lands.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves the control valid and undescribed when there is nothing to say", () => {
    render(
      <Wrap>
        <Field label="عنوان الموضوع">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});

describe("Field — the wiring survives a wrapper", () => {
  it("★ reaches a control nested inside a layout element", () => {
    // This is the case that rules out `cloneElement`: the propose form's
    // duration field is an input and a unit label in a flex row. Cloning the
    // single child would put aria-invalid on the <div>.
    render(
      <Wrap>
        <Field id="expectedDurationMinutes" label="المدة المتوقعة" required error="أدخل مدة معقولة">
          <div className="flex items-center gap-3">
            <Input name="expectedDurationMinutes" type="number" dir="ltr" />
            <span>دقيقة</span>
          </div>
        </Field>
      </Wrap>,
    );
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("id", "expectedDurationMinutes");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAccessibleDescription("أدخل مدة معقولة");
    expect(input.parentElement?.tagName).toBe("DIV");
    expect(input.parentElement).not.toHaveAttribute("aria-invalid");
  });

  it("lets an explicit prop on the control win over the context", () => {
    render(
      <Wrap>
        <Field label="عنوان الموضوع" error="خطأ">
          <Input name="title" invalid={false} />
        </Field>
      </Wrap>,
    );
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("leaves a control used outside a Field entirely alone", () => {
    render(<Input name="q" aria-label="بحث" />);
    const input = screen.getByRole("textbox", { name: "بحث" });
    expect(input).not.toHaveAttribute("id");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-required");
  });
});

describe("Field — axe", () => {
  it("is clean when plain", async () => {
    const { container } = render(
      <Wrap>
        <Field label="عنوان الموضوع">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    await expectAccessible(container);
  });

  it("is clean when required and hinted", async () => {
    const { container } = render(
      <Wrap>
        <Field label="عنوان الموضوع" hint="مثال قصير" required>
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    await expectAccessible(container);
  });

  it("is clean in its failed state", async () => {
    const { container } = render(
      <Wrap>
        <Field label="عنوان الموضوع" hint="مثال قصير" required error="فضلًا أدخل عنوان موضوعك">
          <Input name="title" />
        </Field>
      </Wrap>,
    );
    await expectAccessible(container);
  });
});
