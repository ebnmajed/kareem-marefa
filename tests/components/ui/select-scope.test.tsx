// `<Select>` inside the playground's scope — DEC-183 §4.2, DEC-186 §2, §6, REQ-UIX-030.
//
// New cases live here, never in `select.test.tsx`, which is evidence (DEC-186 §9).
//
// ★ `select.tsx` gains no class: its face is `controlClass()` (`field.tsx`), and its arrow and
// picker are the platform's, which follow the scope's `color-scheme`. What is proven here is that
// it carries `controlClass()`'s scope classes and nothing else new, still draws no chevron, and
// keeps what is on show through React's form reset (DEC-149 §1) inside the scope.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import ar from "@/messages/ar/ui.json";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// `select`'s classes on `main`: `controlClass(isInvalid, "md", className)`.
const BEFORE =
  "block w-full rounded-field border bg-canvas text-fg-heading placeholder:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60 min-h-11 py-2.5 text-body px-4 border-edge-strong".split(
    " ",
  );

const OPTIONS = (
  <>
    <option value="">اختر فئة</option>
    <option value="technical">تقني</option>
    <option value="leadership">قيادة</option>
  </>
);

describe("Select — the scope arrives through controlClass(), and only that", () => {
  it("keeps every class it had on main, in order, and adds only the scope's", () => {
    render(
      <Select aria-label="الفئة" defaultValue="">
        {OPTIONS}
      </Select>,
    );
    const got = classes(screen.getByRole("combobox"));
    expect(got.filter((c) => BEFORE.includes(c))).toEqual(BEFORE);
    expect(got.filter((c) => !BEFORE.includes(c))).toEqual(["pg:rounded-input", "pg:bg-raised"]);
    expect(got.join(" ")).not.toMatch(/\bappearance-none\b/);
  });

  it("an invalid select adds the on-dark edge, and nothing else", () => {
    render(
      <Select aria-label="الفئة" invalid defaultValue="">
        {OPTIONS}
      </Select>,
    );
    expect(classes(screen.getByRole("combobox")).filter((c) => c.startsWith("pg"))).toEqual(["pg:rounded-input", "pg:bg-raised", "pg-dark:border-error-on-dark"]);
  });

  it("★★ inside the scope what is on show survives React's form reset, as outside it", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="theme-play">
        <form>
          <Select aria-label="الفئة" name="category" defaultValue="">
            {OPTIONS}
          </Select>
        </form>
      </div>,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(select, "leadership");
    act(() => (container.querySelector("form") as HTMLFormElement).reset());
    expect(select.value).toBe("leadership");
  });

  it("renders inside the scope, right to left, in a Field with a hint and an error, and is accessible", async () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <div className="theme-play flex flex-col gap-4" dir="rtl">
          <Field label="لغة الجلسة" hint="تحدّد لغة الشهادة">
            <Select name="language" defaultValue="ar">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Field label="الفئة" error="اختر فئة" required>
            <Select name="category" defaultValue="">
              {OPTIONS}
            </Select>
          </Field>
          <Field label="الفئة — مقفلة">
            <Select name="locked" defaultValue="technical" disabled>
              {OPTIONS}
            </Select>
          </Field>
        </div>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("combobox", { name: /الفئة مطلوب/ })).toHaveAccessibleDescription("اختر فئة");
    await expectAccessible(container);
  });
});
