// SCR-016's marking by hand — REQ-CHK-008, STORY-CHK-004, REQ-UIX-062. Once hydrated: a trigger and a
// sheet holding a searchable combobox and the mandatory reason, posting the fields the action has
// always read. A refusal opens the sheet with what was typed.
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import ui from "@/messages/ar/ui.json";
import { ManualMark } from "@/components/checkin/manual-mark";

const messages = { ...checkin, ...ui };
const candidates = [
  { memberId: "11111111-1111-4111-8111-111111111111", displayName: "سارة" },
  { memberId: "22222222-2222-4222-8222-222222222222", displayName: "خالد" },
];
const action = async () => {};

function show(props: Partial<Parameters<typeof ManualMark>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ManualMark action={action} candidates={candidates} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("ManualMark", () => {
  it("is a trigger until pressed; the sheet is named and posts memberId and reason", () => {
    show();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تسجيل يدوي" }));
    const dialog = screen.getByRole("dialog", { name: "تسجيل حضور يدوي" });
    expect(within(dialog).getByRole("combobox")).toBeInTheDocument();
    const form = dialog.querySelector("form")!;
    expect(form).toHaveAttribute("novalidate");
    expect(form.querySelector('input[type="hidden"][name="memberId"]')).not.toBeNull();
    expect(within(dialog).getByLabelText(/السبب/)).toHaveAttribute("name", "reason");
    expect(within(dialog).getByLabelText(/السبب/)).toHaveAttribute("maxlength", "300");
  });

  it("a refusal opens the sheet on arrival, with its alert and what was typed", () => {
    show({ error: "يجب إدخال سبب", memberId: candidates[1].memberId, reason: "تأخر" });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("يجب إدخال سبب");
    expect(dialog.querySelector('input[type="hidden"][name="memberId"]')).toHaveValue(candidates[1].memberId);
    expect(within(dialog).getByLabelText(/السبب/)).toHaveValue("تأخر");
  });

  it("no candidates: the sentence, and no form", () => {
    show({ candidates: [] });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل يدوي" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("لا يوجد أحد لديه حجز مؤكد بلا تسجيل حضور");
    expect(dialog.querySelector("form")).toBeNull();
  });
});
