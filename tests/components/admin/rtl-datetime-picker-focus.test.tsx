// Wave 11, K3 — SC 2.4.3 on the RTL picker. Escape and «تم» unmount the
// popover while focus is inside it; before this, focus fell to <body> and a
// keyboard user started again from the top of the page. It returns to the
// trigger now — and only when it was inside the picker, so an Escape pressed
// elsewhere never pulls focus here.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { RtlDateTimePicker } from "@/components/admin/rtl-datetime-picker";
import uiAr from "@/messages/ar/ui.json";

const LABELS = {
  label: "التاريخ والوقت",
  clearLabel: "امسح",
  todayLabel: "اليوم",
  doneLabel: "تم",
  hourLabel: "الساعة",
  minuteLabel: "الدقيقة",
  emptyLabel: "اختر تاريخًا ووقتًا",
  prevMonthLabel: "الشهر السابق",
  nextMonthLabel: "الشهر التالي",
};
const TRIGGER = new RegExp(`^${LABELS.label}:`);

function renderPicker() {
  return render(
    <NextIntlClientProvider locale="ar" messages={uiAr}>
      <RtlDateTimePicker id="startsAt" name="startsAt" defaultValue="2026-09-20T10:00" locale="ar" {...LABELS} />
      <button type="button">خارج المنتقي</button>
    </NextIntlClientProvider>,
  );
}

describe("RtlDateTimePicker — focus returns to the trigger (SC 2.4.3)", () => {
  it("Escape from inside the popover closes it and focuses the trigger", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("button", { name: TRIGGER }));
    screen.getByLabelText(LABELS.hourLabel).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: TRIGGER })).toHaveFocus();
  });

  it("«تم» closes the popover and focuses the trigger", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("button", { name: TRIGGER }));
    await userEvent.click(screen.getByRole("button", { name: LABELS.doneLabel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: TRIGGER })).toHaveFocus();
  });

  it("an Escape pressed outside the picker closes it without taking focus", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("button", { name: TRIGGER }));
    const outside = screen.getByRole("button", { name: "خارج المنتقي" });
    outside.focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outside).toHaveFocus();
  });
});
