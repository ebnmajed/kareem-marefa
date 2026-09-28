// `console`'s file — DEC-186 §9: new wave-15 cases live in a file of their
// own. `date-time.tsx` itself declares one class, its own wrapper div —
// every visible token lives in `src/components/admin/rtl-datetime-picker.tsx`
// (`.claude/agents/console.md`, `DEC-186` §8: "it joins console's list for
// this wave, tokens only"), so this file's cases exercise the picker
// directly. Token migration, not a behaviour change: every class the picker
// had before this wave is still there, unedited; this proves the `pg:`
// additions land beside them. Not wrapped in `<PlayScope>` — see
// `data-table-scope.test.tsx`'s header comment (`next/font/google` has no
// jsdom alias in `vitest.config.ts`, a lead-only file).
import type { ReactElement, ReactNode } from "react";
import { render as rtlRender, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { RtlDateTimePicker } from "@/components/admin/rtl-datetime-picker";
import uiAr from "@/messages/ar/ui.json";

function Provider({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider locale="ar" messages={uiAr}>{children}</NextIntlClientProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Provider });

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

function openPicker(defaultValue: string) {
  render(<RtlDateTimePicker id="startsAt" name="startsAt" defaultValue={defaultValue} locale="ar" {...LABELS} />);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${LABELS.label}:`) }));
}

describe("RtlDateTimePicker — the playground's scope, token-only", () => {
  it("the popover drops its shadow inside the scope, keeping the border that already told it apart", () => {
    openPicker("");
    const popover = screen.getByRole("dialog", { name: LABELS.label });
    expect(popover).toHaveClass("shadow-[var(--shadow-card)]");
    expect(popover).toHaveClass("pg:shadow-none");
    expect(popover).toHaveClass("border", "border-edge");
  });

  it("the selected day keeps its resting fill and gains the scope's accent", () => {
    openPicker("2026-09-16T18:00");
    const popover = screen.getByRole("dialog", { name: LABELS.label });
    const selected = within(popover).getByRole("button", { name: "16 سبتمبر 2026" });
    expect(selected).toHaveClass("bg-navy-950", "text-white");
    expect(selected).toHaveClass("pg:bg-accent", "pg:text-on-accent");
  });

  it("the «تم» control keeps its resting fill and gains the scope's accent", () => {
    openPicker("");
    const done = screen.getByRole("button", { name: LABELS.doneLabel });
    expect(done).toHaveClass("bg-navy-950", "text-white");
    expect(done).toHaveClass("pg:bg-accent", "pg:text-on-accent");
  });
});
