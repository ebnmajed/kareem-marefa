// `<Input>` inside the playground's scope — DEC-183 §4.2, DEC-186 §2, §6, REQ-UIX-030, contract 5.
//
// New cases live here, never in `input.test.tsx`, which is evidence (DEC-186 §9).
//
// ★ `input.tsx` itself gains no class: its face is `controlClass()` (`field.tsx`), and the one
// colour of its own — the start icon's `text-fg-muted` — reads a variable the scope reassigns.
// What is proven here is that the input carries `controlClass()`'s scope classes and nothing else
// new, on every size and state the register form and the shell use.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Field } from "@/components/ui/field";
import { SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import ar from "@/messages/ar/ui.json";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      {children}
    </NextIntlClientProvider>
  );
}

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The register form's email input on `main`: `size="lg"`, valid (`registration-form.tsx:468`).
const REGISTER_EMAIL =
  "block w-full rounded-field border bg-canvas text-fg-heading placeholder:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60 min-h-12 py-3 text-body px-4 border-edge-strong".split(
    " ",
  );

describe("Input — the scope arrives through controlClass(), and only that", () => {
  it("the register form's input keeps every class it had on main, in order, and adds only the scope's", () => {
    render(<Input aria-label="البريد الإلكتروني" name="email" size="lg" dir="ltr" />);
    const got = classes(screen.getByRole("textbox"));
    expect(got.filter((c) => REGISTER_EMAIL.includes(c))).toEqual(REGISTER_EMAIL);
    expect(got.filter((c) => !REGISTER_EMAIL.includes(c))).toEqual(["pg:rounded-input", "pg:bg-raised"]);
  });

  it("an invalid input adds the on-dark edge, and nothing else", () => {
    render(<Input aria-label="البريد الإلكتروني" invalid />);
    const got = classes(screen.getByRole("textbox"));
    expect(got).toContain("border-error-border");
    expect(got.filter((c) => c.startsWith("pg"))).toEqual(["pg:rounded-input", "pg:bg-raised", "pg-dark:border-error-on-dark"]);
  });

  it("the start icon's slot keeps its classes — its colour is a reassigned variable", () => {
    render(<Input aria-label="بحث" startIcon={<SearchIcon />} />);
    const slot = document.querySelector('[data-slot="start-icon"]');
    expect(classes(slot)).toEqual(["pointer-events-none", "absolute", "inset-y-0", "start-0", "flex", "items-center", "text-fg-muted", "ps-3.5", "text-[1.125rem]"]);
  });

  it("renders inside the scope, right to left, at every size and state, and is accessible", async () => {
    const { container } = render(
      <Wrap>
        <div className="theme-play flex flex-col gap-4" dir="rtl">
          <Field label="الاسم" required>
            <Input name="name" size="lg" />
          </Field>
          <Field label="البريد الإلكتروني" error="البريد غير صحيح">
            <Input name="email" size="lg" dir="ltr" />
          </Field>
          <Input aria-label="بحث في الجلسات" startIcon={<SearchIcon />} placeholder="ابحث عن جلسة" />
          <Input aria-label="المدة" size="sm" disabled defaultValue="60" />
        </div>
      </Wrap>,
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    await expectAccessible(container);
  });
});
