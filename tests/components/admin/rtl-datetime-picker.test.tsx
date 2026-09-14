// RtlDateTimePicker — SCR-043's carried-over item (DEC-045). No
// NextIntlClientProvider needed: every string is a prop, not read through
// `useTranslations`, so the host page supplies real `ar.json` strings and
// this test can too, directly.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RtlDateTimePicker } from "@/components/admin/rtl-datetime-picker";

const LABELS = {
  label: "التاريخ والوقت",
  clearLabel: "امسح",
  todayLabel: "اليوم",
  doneLabel: "تم",
  hourLabel: "الساعة",
  minuteLabel: "الدقيقة",
  emptyLabel: "اختر تاريخًا ووقتًا",
};

// The trigger's accessible name is `aria-label="${label}: ${displayText}"`,
// not a plain `label htmlFor` association — that would freeze the name at
// the field label alone regardless of the current value, discarding
// exactly what a screen reader needs (the component's own header explains
// why). So every query for the trigger matches on the label as a prefix.
const TRIGGER = new RegExp(`^${LABELS.label}:`);

function renderPicker(defaultValue: string, numerals: "western" | "arabic_indic" = "western") {
  const { container } = render(
    <RtlDateTimePicker id="startsAt" name="startsAt" defaultValue={defaultValue} numerals={numerals} locale="ar" {...LABELS} />,
  );
  return container;
}

describe("RtlDateTimePicker", () => {
  it("shows the empty label with no value, and the hidden field starts empty", () => {
    const container = renderPicker("");
    expect(screen.getByRole("button", { name: new RegExp(`${LABELS.label}: ${LABELS.emptyLabel}`) })).toBeInTheDocument();
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue("");
  });

  it("opens the calendar on click, and picking a day sets the hidden field's date (keeping any existing time)", () => {
    const container = renderPicker("2026-09-16T18:00");
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    expect(screen.getByRole("dialog", { name: LABELS.label })).toBeInTheDocument();

    // Day 10 of the same visible month, queried by its full-date
    // `aria-label` — a bare "10" is ambiguous in months whose trailing
    // padding reaches ten days into the next one (September 2026 does).
    fireEvent.click(screen.getByRole("button", { name: "10 سبتمبر 2026" }));
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue("2026-09-10T18:00");
  });

  it("changing the hour/minute selects updates the hidden field without touching the date", () => {
    const container = renderPicker("2026-09-16T18:00");
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));

    fireEvent.change(screen.getByLabelText(LABELS.hourLabel), { target: { value: "9" } });
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue("2026-09-16T09:00");

    fireEvent.change(screen.getByLabelText(LABELS.minuteLabel), { target: { value: "30" } });
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue("2026-09-16T09:30");
  });

  it("the done button closes the popover", () => {
    renderPicker("2026-09-16T18:00");
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: LABELS.doneLabel }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("★ REQ-INT-006: day numbers follow the org's own numeral system, not the browser's", () => {
    const container = renderPicker("2026-09-16T18:00", "arabic_indic");
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    // The visible glyph is Arabic-Indic; the accessible name (which
    // disambiguates same-numbered cells across months) carries the same
    // numeral system through its own `-u-nu-` formatting.
    const day = screen.getByRole("button", { name: "١٠ سبتمبر ٢٠٢٦" });
    expect(day).toBeInTheDocument();
    expect(day).toHaveTextContent("١٠");
    fireEvent.click(day);
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue("2026-09-10T18:00");
  });

  it("a required field has no clear button", () => {
    render(<RtlDateTimePicker id="startsAt" name="startsAt" defaultValue="2026-09-16T18:00" numerals="western" locale="ar" required {...LABELS} />);
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    expect(screen.queryByRole("button", { name: LABELS.clearLabel })).not.toBeInTheDocument();
  });

  it("an optional field has a clear button", () => {
    render(<RtlDateTimePicker id="endsAt" name="endsAt" defaultValue="2026-09-16T18:00" numerals="western" locale="ar" {...LABELS} />);
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    expect(screen.getByRole("button", { name: LABELS.clearLabel })).toBeInTheDocument();
  });
});
