// `<Textarea>` inside the playground's scope — DEC-183 §4.2, DEC-186 §2, §6, REQ-UIX-030, contract 5.
//
// New cases live here, never in `textarea.test.tsx`, which is evidence (DEC-186 §9).
//
// ★ `textarea.tsx` gains no class: its face is `controlClass()` (`field.tsx`). What is proven here
// is that the register form's description box carries `controlClass()`'s scope classes and nothing
// else new, and that `rows` and the long-form floor behave as before.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import ar from "@/messages/ar/ui.json";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The register form's description on `main`: `rows={3}`, `className="min-h-[7.5rem]"`
// (`registration-form.tsx:460`).
const REGISTER_DESCRIPTION =
  "block w-full rounded-field border bg-canvas text-fg-heading placeholder:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60 min-h-11 py-2.5 text-body px-4 border-edge-strong min-h-[7.5rem]".split(
    " ",
  );

describe("Textarea — the scope arrives through controlClass(), and only that", () => {
  it("the register form's description keeps every class it had on main, in order, and adds only the scope's", () => {
    render(<Textarea aria-label="نبذة" name="topicDescription" rows={3} className="min-h-[7.5rem]" />);
    const box = screen.getByRole("textbox");
    const got = classes(box);
    expect(got.filter((c) => REGISTER_DESCRIPTION.includes(c))).toEqual(REGISTER_DESCRIPTION);
    expect(got.filter((c) => !REGISTER_DESCRIPTION.includes(c))).toEqual(["pg:rounded-input", "pg:bg-raised"]);
    expect(box).toHaveAttribute("rows", "3");
    expect(got).not.toContain("min-h-32");
  });

  it("the long-form default keeps its five rows and its floor", () => {
    render(<Textarea aria-label="نبذة" />);
    const box = screen.getByRole("textbox");
    expect(box).toHaveAttribute("rows", "5");
    expect(classes(box)).toContain("min-h-32");
  });

  it("renders inside the scope, right to left, and is accessible", async () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <div className="theme-play flex flex-col gap-4" dir="rtl">
          <Field label="نبذة عن الجلسة" hint="جملتان أو ثلاث" required>
            <Textarea name="abstract" />
          </Field>
          <Field label="سبب الرفض" error="اكتب سببًا">
            <Textarea name="reason" rows={3} />
          </Field>
        </div>
      </NextIntlClientProvider>,
    );
    await expectAccessible(container);
  });
});
