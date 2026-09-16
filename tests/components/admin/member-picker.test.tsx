// MemberPicker — SCR-053's manual adjustment and SCR-054's manual award. A
// control inside `<Field>` since wave 8: the Field owns the label, «مطلوب», the
// hint and the error, and `ui/combobox` reads them off the context.
import { fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { MemberPicker, type PickableMember } from "@/components/admin/member-picker";
import { Field } from "@/components/ui/field";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...uiAr };

const MEMBERS: PickableMember[] = [
  { id: "m1", displayName: "سارة العتيبي", email: "sara@example.com" },
  { id: "m2", displayName: "خالد الحربي", email: "khalid@example.com" },
  { id: "m3", displayName: null, email: "noname@example.com" },
];

function renderPicker(error?: string, defaultValue?: string) {
  const { container } = render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <main>
        <Field id="adjust-member" label="العضو" required error={error}>
          <MemberPicker members={MEMBERS} name="memberId" placeholder="اكتب اسم العضو" noMatches="لا يوجد عضو مطابق" defaultValue={defaultValue} />
        </Field>
      </main>
    </NextIntlClientProvider>,
  );
  return container;
}

describe("MemberPicker", () => {
  it("starts with an empty hidden value, named by the Field with «مطلوب», never an asterisk", () => {
    const container = renderPicker();
    expect(container.querySelector('input[name="memberId"]')).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "العضو مطلوب" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("*");
  });

  it("★ typing filters by name, and selecting sets the hidden field to the member's id", () => {
    const container = renderPicker();
    fireEvent.change(screen.getByRole("combobox", { name: "العضو مطلوب" }), { target: { value: "خالد" } });
    expect(screen.getByRole("option", { name: /خالد الحربي/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /سارة العتيبي/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /خالد الحربي/ }));
    expect(container.querySelector('input[name="memberId"]')).toHaveValue("m2");
  });

  it("also matches by email, for a member with no display name", () => {
    renderPicker();
    fireEvent.change(screen.getByRole("combobox", { name: "العضو مطلوب" }), { target: { value: "noname" } });
    expect(screen.getByRole("option", { name: /noname@example.com/ })).toBeInTheDocument();
  });

  it("carries the Field's error, and a value handed back after a refusal", () => {
    const container = renderPicker("اختر عضوًا.", "m1");
    const input = screen.getByRole("combobox", { name: "العضو مطلوب" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("اختر عضوًا.");
    expect(container.querySelector('input[name="memberId"]')).toHaveValue("m1");
  });

  it("has no axe violations", async () => {
    const container = renderPicker("اختر عضوًا.");
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  }, 20000);
});
