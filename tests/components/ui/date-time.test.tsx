// `console`'s adoption of the RTL picker built for SCR-043 (DEC-045) onto
// `DateTimeProps`. Proves the seam — id/name/value wiring, the label, the
// Field wiring, `onChange` on every commit, the date-only mode — while the
// picker's own bidi and numeral behaviour is proven by
// `tests/components/admin/rtl-datetime-picker.test.tsx`, not re-proven here.
import type React from "react";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { DateTime } from "@/components/ui/date-time";
import { Field } from "@/components/ui/field";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const ar = { ...adminAr, ...uiAr };

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      {children}
    </NextIntlClientProvider>
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("DateTime — granularity=minute", () => {
  it("renders the picker's trigger, carrying the value in a hidden field", () => {
    const { container } = render(
      <Wrap>
        <DateTime id="starts-at" name="startsAt" defaultValue="2026-10-01T18:00" />
      </Wrap>,
    );
    expect(screen.getByRole("button", { name: /التاريخ والوقت/ })).toBeInTheDocument();
    expect(container.querySelector('input[type="hidden"][name="startsAt"]')).toHaveValue("2026-10-01T18:00");
  });

  it("names the trigger with `label`, so two pickers on one form are told apart", () => {
    render(
      <Wrap>
        <DateTime name="rsvpDeadlineAt" label="آخر موعد للحجز" defaultValue="" />
        <DateTime name="cancellationCutoffAt" label="آخر موعد للإلغاء" defaultValue="" />
      </Wrap>,
    );
    expect(screen.getByRole("button", { name: /^آخر موعد للحجز:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^آخر موعد للإلغاء:/ })).toBeInTheDocument();
  });

  it("opens the calendar popover from the trigger", async () => {
    render(
      <Wrap>
        <DateTime id="starts-at" name="startsAt" defaultValue="2026-10-01T18:00" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("button", { name: /التاريخ والوقت/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ar.admin.dateTime.done })).toBeInTheDocument();
  });

  it("a controlled value re-seeds the picker", () => {
    const { rerender, container } = render(
      <Wrap>
        <DateTime id="starts-at" name="startsAt" value="2026-10-01T18:00" onChange={() => {}} />
      </Wrap>,
    );
    expect(container.querySelector('input[type="hidden"][name="startsAt"]')).toHaveValue("2026-10-01T18:00");
    rerender(
      <Wrap>
        <DateTime id="starts-at" name="startsAt" value="2026-11-05T09:30" onChange={() => {}} />
      </Wrap>,
    );
    expect(container.querySelector('input[type="hidden"][name="startsAt"]')).toHaveValue("2026-11-05T09:30");
  });

  it("★ onChange fires on every commit, and a controlled picker stays open while the member picks a day and then an hour", async () => {
    const seen: (string | null)[] = [];
    function Controlled() {
      const [value, setValue] = useState<string | null>("2026-10-01T18:00");
      return (
        <DateTime
          name="startsAt"
          label="يبدأ"
          value={value}
          onChange={(next) => {
            seen.push(next);
            setValue(next);
          }}
        />
      );
    }
    const { container } = render(
      <Wrap>
        <Controlled />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("button", { name: /^يبدأ:/ }));
    await userEvent.click(screen.getByRole("button", { name: "10 أكتوبر 2026" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(ar.admin.dateTime.hour), "9");
    expect(seen).toEqual(["2026-10-10T18:00", "2026-10-10T09:00"]);
    expect(container.querySelector('input[type="hidden"][name="startsAt"]')).toHaveValue("2026-10-10T09:00");

    await userEvent.click(screen.getByRole("button", { name: ar.admin.dateTime.clear }));
    expect(seen.at(-1)).toBeNull();
  });

  it("has no axe violations, closed or open", async () => {
    // Inside `<main>`: the real app always renders this under `<main id="main">`;
    // an isolated render outside any landmark trips axe's `region` rule, an
    // artefact of the harness, not of the component.
    render(
      <Wrap>
        <main>
          <DateTime id="starts-at" name="startsAt" defaultValue="" />
        </main>
      </Wrap>,
    );
    await expectAccessible(document.body);
    await userEvent.click(screen.getByRole("button", { name: /التاريخ والوقت/ }));
    await expectAccessible(document.body);
  }, 20000);
});

describe("DateTime inside <Field> (wave 8, the lead's request)", () => {
  function inField(props: { error?: string; hint?: string; required?: boolean }) {
    return render(
      <Wrap>
        <main>
          <Field id="ends-at" label="ينتهي" hint={props.hint} error={props.error} required={props.required}>
            <DateTime name="endsAt" label="ينتهي" defaultValue="2026-10-01T19:00" />
          </Field>
        </main>
      </Wrap>,
    );
  }

  it("draws no second label: the Field's is the only visible one, and its `for` reaches the trigger", () => {
    const { container } = inField({});
    expect(container.querySelectorAll("label")).toHaveLength(1);
    expect(within(container).queryByText("ينتهي", { selector: "p" })).toBeNull();
    const trigger = screen.getByRole("button", { name: /^ينتهي:/ });
    expect(trigger).toHaveAttribute("id", "ends-at");
    expect(container.querySelector('label[for="ends-at"]')).not.toBeNull();
    expect(container.querySelector('input[type="hidden"][name="endsAt"]')).not.toHaveAttribute("id");
  });

  it("carries the Field's error and hint onto the trigger, and its invalid state", () => {
    inField({ error: "الانتهاء قبل البداية", hint: "بتوقيت المؤسسة" });
    const trigger = screen.getByRole("button", { name: /^ينتهي:/ });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAccessibleDescription("الانتهاء قبل البداية بتوقيت المؤسسة");
  });

  it("a required Field hides the clear control", async () => {
    inField({ required: true });
    await userEvent.click(screen.getByRole("button", { name: /^ينتهي:/ }));
    expect(screen.queryByRole("button", { name: ar.admin.dateTime.clear })).toBeNull();
  });

  it("has no axe violations with an error, closed or open", async () => {
    inField({ error: "الانتهاء قبل البداية", required: true });
    await expectAccessible(document.body);
    await userEvent.click(screen.getByRole("button", { name: /^ينتهي:/ }));
    await expectAccessible(document.body);
  }, 20000);
});

describe("DateTime — granularity=date (the picker's date-only mode)", () => {
  it("is the picker, never a native date input, and carries YYYY-MM-DD", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Wrap>
        <DateTime name="from" granularity="date" defaultValue="2026-10-01" onChange={onChange} />
      </Wrap>,
    );
    expect(container.querySelector('input[type="date"]')).toBeNull();
    const trigger = screen.getByRole("button", { name: /^التاريخ:/ });
    expect(trigger).toHaveAccessibleName("التاريخ: 1 أكتوبر 2026");
    await userEvent.click(trigger);
    expect(screen.queryByLabelText(ar.admin.dateTime.hour)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "12 أكتوبر 2026" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-10-12");
    expect(container.querySelector('input[type="hidden"][name="from"]')).toHaveValue("2026-10-12");
  });

  it("disables the days outside min and max", async () => {
    render(
      <Wrap>
        <DateTime name="to" granularity="date" defaultValue="2026-10-15" min="2026-10-10" max="2026-10-20" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("button", { name: /^التاريخ:/ }));
    expect(screen.getByRole("button", { name: "9 أكتوبر 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "10 أكتوبر 2026" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "20 أكتوبر 2026" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "21 أكتوبر 2026" })).toBeDisabled();
  });

  it("has no axe violations inside a Field", async () => {
    render(
      <Wrap>
        <main>
          <Field id="audit-from" label="من">
            <DateTime name="from" label="من" granularity="date" defaultValue="" />
          </Field>
        </main>
      </Wrap>,
    );
    await expectAccessible(document.body);
    await userEvent.click(screen.getByRole("button", { name: /^من:/ }));
    await expectAccessible(document.body);
  }, 20000);
});
