// RtlDateTimePicker — SCR-043's carried-over item (DEC-045). No
// NextIntlClientProvider needed: every string is a prop, not read through
// `useTranslations`, so the host page supplies real `ar.json` strings and
// this test can too, directly.
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RtlDateTimePicker } from "@/components/admin/rtl-datetime-picker";

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

// The trigger's accessible name is `aria-label="${label}: ${displayText}"`,
// not a plain `label htmlFor` association — that would freeze the name at
// the field label alone regardless of the current value, discarding
// exactly what a screen reader needs (the component's own header explains
// why). So every query for the trigger matches on the label as a prefix.
const TRIGGER = new RegExp(`^${LABELS.label}:`);

function renderPicker(defaultValue: string) {
  const { container } = render(
    <RtlDateTimePicker id="startsAt" name="startsAt" defaultValue={defaultValue} locale="ar" {...LABELS} />,
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

  it("★ WCAG 4.1.2: the month-navigation buttons have accessible names, like every other button in the picker", () => {
    renderPicker("2026-09-16T18:00");
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    const dialog = screen.getByRole("dialog");
    // Chevron-only buttons: without the label a screen reader announces
    // «زر» and nothing else — M9's axe assertion found both unnamed.
    expect(within(dialog).getByRole("button", { name: LABELS.prevMonthLabel })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: LABELS.nextMonthLabel })).toBeInTheDocument();
    for (const button of within(dialog).getAllByRole("button")) expect(button).toHaveAccessibleName();
  });

  it("★ REQ-INT-006, DEC-124: day numbers are Western digits in an Arabic picker, never the locale's Arabic-Indic default", () => {
    const container = renderPicker("2026-09-16T18:00");
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    // The visible glyph is Western; the accessible name (which disambiguates
    // same-numbered cells across months) carries the same digits through its
    // own `-u-nu-latn` formatting — `ar`'s CLDR default would be Arabic-Indic.
    expect(container.textContent ?? "").not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
    const day = screen.getByRole("button", { name: "10 سبتمبر 2026" });
    expect(day).toBeInTheDocument();
    expect(day).toHaveTextContent("10");
    fireEvent.click(day);
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue("2026-09-10T18:00");
  });

  it("a required field has no clear button", () => {
    render(<RtlDateTimePicker id="startsAt" name="startsAt" defaultValue="2026-09-16T18:00" locale="ar" required {...LABELS} />);
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    expect(screen.queryByRole("button", { name: LABELS.clearLabel })).not.toBeInTheDocument();
  });

  it("an optional field has a clear button", () => {
    render(<RtlDateTimePicker id="endsAt" name="endsAt" defaultValue="2026-09-16T18:00" locale="ar" {...LABELS} />);
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    expect(screen.getByRole("button", { name: LABELS.clearLabel })).toBeInTheDocument();
  });
});

// Wave 8 — the lead's sync-1 requests (`DEC-148`): `onValueChange` on every
// commit, a controlled `value`, `hideLabel` for a picker inside `<Field>`, and
// `dateOnly`. The standalone cases above are unchanged, which is the proof
// the schedule form's existing path does not move.
describe("RtlDateTimePicker — wave 8 additions", () => {
  it("onValueChange fires on a day, an hour, a minute, «اليوم» and «امسح», from the handler that made the change", () => {
    const onValueChange = vi.fn();
    render(<RtlDateTimePicker id="startsAt" name="startsAt" defaultValue="2026-09-16T18:00" locale="ar" onValueChange={onValueChange} {...LABELS} />);
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    fireEvent.click(screen.getByRole("button", { name: "10 سبتمبر 2026" }));
    fireEvent.change(screen.getByLabelText(LABELS.hourLabel), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText(LABELS.minuteLabel), { target: { value: "30" } });
    expect(onValueChange.mock.calls.map((c) => c[0])).toEqual(["2026-09-10T18:00", "2026-09-10T09:00", "2026-09-10T09:30"]);
    fireEvent.click(screen.getByRole("button", { name: LABELS.todayLabel }));
    expect(onValueChange.mock.calls.at(-1)?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}T09:30$/);
    fireEvent.click(screen.getByRole("button", { name: LABELS.clearLabel }));
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("controlled: renders `value`, and a commit changes nothing until the owner passes the new value", () => {
    const onValueChange = vi.fn();
    const { container, rerender } = render(
      <RtlDateTimePicker id="startsAt" name="startsAt" defaultValue="" value="2026-09-16T18:00" locale="ar" onValueChange={onValueChange} {...LABELS} />,
    );
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    fireEvent.click(screen.getByRole("button", { name: "10 سبتمبر 2026" }));
    expect(onValueChange).toHaveBeenLastCalledWith("2026-09-10T18:00");
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue("2026-09-16T18:00");
    rerender(<RtlDateTimePicker id="startsAt" name="startsAt" defaultValue="" value="2026-09-10T18:00" locale="ar" onValueChange={onValueChange} {...LABELS} />);
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue("2026-09-10T18:00");
    // The popover survived the owner's update: no remount.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("hideLabel: no label or hint of its own, the trigger takes the id, and it carries describedBy and invalid", () => {
    const { container } = render(
      <>
        <p id="host-error">الانتهاء قبل البداية</p>
        <RtlDateTimePicker id="endsAt" name="endsAt" hint="تلميح" defaultValue="" locale="ar" hideLabel describedBy="host-error" invalid {...LABELS} />
      </>,
    );
    expect(container.querySelector("#endsAt-label")).toBeNull();
    expect(screen.queryByText("تلميح")).toBeNull();
    const trigger = screen.getByRole("button", { name: TRIGGER });
    expect(trigger).toHaveAttribute("id", "endsAt");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAccessibleDescription("الانتهاء قبل البداية");
    expect(container.querySelector('input[name="endsAt"]')).not.toHaveAttribute("id");
  });

  it("dateOnly: YYYY-MM-DD in and out, and no hour or minute", () => {
    const onValueChange = vi.fn();
    const container = render(
      <RtlDateTimePicker id="from" name="from" defaultValue="2026-09-16" locale="ar" dateOnly onValueChange={onValueChange} {...LABELS} />,
    ).container;
    expect(screen.getByRole("button", { name: `${LABELS.label}: 16 سبتمبر 2026` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: TRIGGER }));
    expect(screen.queryByLabelText(LABELS.hourLabel)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "10 سبتمبر 2026" }));
    expect(onValueChange).toHaveBeenLastCalledWith("2026-09-10");
    expect(container.querySelector('input[name="from"]')).toHaveValue("2026-09-10");
  });
});
