// MemberPicker — SCR-053's carried-over item (scoring.md's flagged gap,
// console.md's story order item 2). No NextIntlClientProvider needed: every
// string is a prop.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberPicker, type PickableMember } from "@/components/admin/member-picker";

const MEMBERS: PickableMember[] = [
  { id: "m1", displayName: "سارة العتيبي", email: "sara@example.com" },
  { id: "m2", displayName: "خالد الحربي", email: "khalid@example.com" },
  { id: "m3", displayName: null, email: "noname@example.com" },
];

function renderPicker() {
  const { container } = render(
    <MemberPicker members={MEMBERS} name="memberId" label="العضو" required placeholder="اكتب اسم العضو" noMatches="لا يوجد عضو مطابق" />,
  );
  return container;
}

describe("MemberPicker", () => {
  it("starts with an empty hidden value", () => {
    const container = renderPicker();
    expect(container.querySelector('input[name="memberId"]')).toHaveValue("");
  });

  it("★ typing filters by name, and selecting sets the hidden field to the member's id", () => {
    const container = renderPicker();
    fireEvent.change(screen.getByRole("combobox", { name: "العضو" }), { target: { value: "خالد" } });

    expect(screen.getByRole("option", { name: /خالد الحربي/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /سارة العتيبي/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /خالد الحربي/ }));
    expect(container.querySelector('input[name="memberId"]')).toHaveValue("m2");
  });

  it("also matches by email, for a member with no display name", () => {
    renderPicker();
    fireEvent.change(screen.getByRole("combobox", { name: "العضو" }), { target: { value: "noname" } });
    expect(screen.getByRole("option", { name: /noname@example.com/ })).toBeInTheDocument();
  });

  it("editing the text after a selection clears the hidden value until a new one is picked", () => {
    const container = renderPicker();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "سارة" } });
    fireEvent.click(screen.getByRole("option", { name: /سارة العتيبي/ }));
    expect(container.querySelector('input[name="memberId"]')).toHaveValue("m1");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "سارة ا" } });
    expect(container.querySelector('input[name="memberId"]')).toHaveValue("");
  });

  it("shows the no-matches message for a query nobody has", () => {
    renderPicker();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzznotamatch" } });
    expect(screen.getByText("لا يوجد عضو مطابق")).toBeInTheDocument();
  });
});
