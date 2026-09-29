// `<Field>` and `controlClass()` inside the playground's scope — DEC-183 §4.2, DEC-186 §2, §6,
// REQ-UIX-030, contract 5.
//
// New cases live here, never in `field.test.tsx`, which is evidence (DEC-186 §9).
//
// ★ `field`, `input` and `textarea` are rendered by the public register form, so the first
// thing proven here is that every class they had is still there, in its place: the scope's look
// is ADDED after it. What the browser computes on `/ar/register` is proven by
// `tests/e2e/wave15-sessions-public-controls.spec.ts`, against `main`'s build.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { Size } from "@/components/ui";
import { controlClass, Field } from "@/components/ui/field";
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

// `controlClass()` as it stood before wave 15, verbatim — the string the register form's four
// controls carried on `main`.
const BASE = "block w-full rounded-field border bg-canvas text-fg-heading placeholder:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60";
const SIZES: Record<Size, string> = {
  sm: "min-h-9 py-1.5 text-caption",
  md: "min-h-11 py-2.5 text-body",
  lg: "min-h-12 py-3 text-body",
};
const INLINE: Record<Size, { plain: string; startIcon: string }> = {
  sm: { plain: "px-3", startIcon: "ps-9 pe-3" },
  md: { plain: "px-4", startIcon: "ps-11 pe-4" },
  lg: { plain: "px-4", startIcon: "ps-11 pe-4" },
};
function before(invalid: boolean, size: Size, extra: string, startIcon: boolean) {
  return `${BASE} ${SIZES[size]} ${startIcon ? INLINE[size].startIcon : INLINE[size].plain} ${invalid ? "border-error-border" : "border-edge-strong"} ${extra}`;
}
const SCOPE = "pg:rounded-input pg:bg-raised";

describe("controlClass() — every class it had, in its place, and the scope's after them", () => {
  const cases = (["sm", "md", "lg"] as const).flatMap((size) =>
    [false, true].flatMap((invalid) => [false, true].map((startIcon) => ({ size, invalid, startIcon }))),
  );

  it.each(cases)("$size, invalid $invalid, start icon $startIcon", ({ size, invalid, startIcon }) => {
    const got = controlClass(invalid, size, "min-h-[7.5rem]", { startIcon }).split(/\s+/).filter(Boolean);
    const was = before(invalid, size, "min-h-[7.5rem]", startIcon).split(/\s+/).filter(Boolean);
    // The classes that existed are all there, in the order they were written…
    expect(got.filter((c) => was.includes(c))).toEqual(was);
    // …and only the scope's are new.
    const added = got.filter((c) => !was.includes(c));
    expect(added).toEqual(invalid ? [...SCOPE.split(" "), "pg-dark:border-error-on-dark"] : SCOPE.split(" "));
    // Every added class is under a scope variant, so nothing outside `.theme-play` can read it.
    for (const cls of added) expect(cls).toMatch(/^pg(-dark|-light)?:/);
  });

  it("keeps a caller's own classes last, so they still win over the house classes", () => {
    const got = controlClass(false, "md", "w-32 text-center").split(/\s+/);
    expect(got.slice(-2)).toEqual(["w-32", "text-center"]);
  });
});

describe("Field — its own parts", () => {
  it("keeps the label's, the hint's and «مطلوب»'s classes, and adds only the error's on-dark colour", () => {
    render(
      <Wrap>
        <Field id="reg-email" label="البريد الإلكتروني" hint="نراسلك عليه فقط" error="البريد غير صحيح" required>
          <Input name="email" />
        </Field>
      </Wrap>,
    );
    const label = document.querySelector('label[for="reg-email"]');
    expect(classes(label)).toEqual(["text-label", "text-fg-heading"]);
    expect(classes(label!.querySelector("span"))).toEqual(["ms-2", "text-caption", "font-normal", "text-fg-muted"]);
    expect(classes(document.getElementById("reg-email-hint"))).toEqual(["mt-1", "text-caption", "text-fg-muted"]);
    expect(classes(document.getElementById("reg-email-error"))).toEqual([
      "mt-2",
      "flex",
      "items-start",
      "gap-2",
      "text-caption",
      "text-error",
      "pg-dark:text-error-on-dark",
    ]);
  });

  it("wires the same aria as before — the form model is untouched", () => {
    render(
      <Wrap>
        <Field id="reg-name" label="الاسم" error="اكتب اسمك" required>
          <Input name="name" />
        </Field>
      </Wrap>,
    );
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("id", "reg-name");
    expect(input).toHaveAttribute("aria-describedby", "reg-name-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
  });

  it("renders inside the scope, right to left, named «… مطلوب», and is accessible", async () => {
    const { container } = render(
      <Wrap>
        <div className="theme-play" dir="rtl">
          <Field id="t" label="عنوان الجلسة" hint="بين 3 و150 حرفًا" required>
            <Input name="title" />
          </Field>
          <Field id="e" label="البريد الإلكتروني" error="البريد غير صحيح">
            <Input name="email" dir="ltr" />
          </Field>
        </div>
      </Wrap>,
    );
    expect(screen.getByRole("textbox", { name: /عنوان الجلسة/ })).toHaveAccessibleDescription("بين 3 و150 حرفًا");
    expect(screen.getByRole("textbox", { name: /البريد الإلكتروني/ })).toHaveAccessibleDescription("البريد غير صحيح");
    await expectAccessible(container);
  });
});
