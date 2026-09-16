// SCR-060's form on the form model — the offsets as rows of a number and a
// unit, each refused at its own row, the toast from the action's result, and
// focus that follows adding and removing a row.
import type React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { RemindersForm } from "@/app/[locale]/app/admin/reminders/reminders-form";
import type { RemindersState } from "@/app/[locale]/app/admin/reminders/state";
import { ToastProvider } from "@/components/ui/toast";
import { formStateFrom, withErrors } from "@/lib/form-state";
import adminAr from "@/messages/ar/admin.json";
import notificationsAr from "@/messages/ar/notifications.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...notificationsAr, ...uiAr };

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{children}</main>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

type Action = (previous: RemindersState, formData: FormData) => Promise<RemindersState>;
const saved: Action = async () => ({ errors: {}, formError: null, values: {}, lists: {}, attempt: 0, saved: true });

function renderForm(action: Action = saved, offsets = [10080, 1440, 120], prompt = 60) {
  return render(
    <Wrap>
      <RemindersForm action={action} offsetsMinutes={offsets} promptMinutes={prompt} />
    </Wrap>,
  );
}

describe("RemindersForm", () => {
  it("shows each stored offset in the largest unit that divides it", () => {
    renderForm();
    const rows = screen.getAllByRole("listitem").filter((li) => li.closest("form"));
    expect(rows).toHaveLength(3);
    const read = (i: number) => [within(rows[i]).getByRole("spinbutton"), within(rows[i]).getByRole("combobox")] as [HTMLInputElement, HTMLSelectElement];
    expect(read(0).map((c) => c.value)).toEqual(["7", "days"]);
    expect(read(1).map((c) => c.value)).toEqual(["1", "days"]);
    expect(read(2).map((c) => c.value)).toEqual(["2", "hours"]);
    expect(screen.getByLabelText("التذكير 1")).toHaveValue(7);
    expect(screen.getByRole("combobox", { name: "التذكير 1 — الوحدة" })).toHaveValue("days");
  });

  it("adding a row focuses it; removing one moves focus to the row above; six rows hide «أضف تذكيرًا»", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "أضف تذكيرًا" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("التذكير 4")));

    await userEvent.click(screen.getByRole("button", { name: "أزل التذكير 4" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("التذكير 3")));

    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "أضف تذكيرًا" }));
    expect(screen.queryByRole("button", { name: "أضف تذكيرًا" })).toBeNull();
    expect(screen.getByText("ستة تذكيرات هي الحد.")).toBeInTheDocument();
  });

  it("the last row cannot be removed — the control is not rendered", () => {
    renderForm(saved, [1440]);
    expect(screen.queryByRole("button", { name: /أزل التذكير/ })).toBeNull();
  });

  it("a refusal lands at its row, keeps what was typed, and the summary's link focuses the row", async () => {
    const refusing: Action = async (previous, formData) => {
      const captured = formStateFrom<string>(formData, { fields: ["promptAmount", "promptUnit"], lists: ["offsetKey", "offsetAmount", "offsetUnit"], previous });
      return { ...withErrors(captured, { "offset-r1": "offsetDuplicate" }), saved: false };
    };
    const { container } = renderForm(refusing);
    fireEvent.change(screen.getByLabelText("التذكير 2"), { target: { value: "24" } });
    fireEvent.change(screen.getByRole("combobox", { name: "التذكير 2 — الوحدة" }), { target: { value: "hours" } });
    fireEvent.submit(container.querySelector("form")!);

    const summary = await screen.findByRole("alert");
    expect(within(summary).getByRole("link", { name: /التذكير 2/ })).toBeInTheDocument();
    expect(screen.getByLabelText("التذكير 2")).toHaveValue(24);
    expect(screen.getByLabelText("التذكير 2")).toHaveAccessibleDescription("هذه المدة في تذكير آخر.");

    fireEvent.click(within(summary).getByRole("link", { name: /التذكير 2/ }));
    expect(document.activeElement).toBe(screen.getByLabelText("التذكير 2"));
  });

  it("a save toasts from the action's result", async () => {
    const action = vi.fn(saved);
    const { container } = renderForm(action);
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText("حُفظ الجدول وحُرّكت التذكيرات المعلّقة")).toBeInTheDocument();
    const posted = action.mock.calls[0][1];
    expect(posted.getAll("offsetAmount")).toEqual(["7", "1", "2"]);
    expect(posted.getAll("offsetUnit")).toEqual(["days", "days", "hours"]);
    expect([posted.get("promptAmount"), posted.get("promptUnit")]).toEqual(["1", "hours"]);
  });

  it("has no axe violations, clean and with a refusal", async () => {
    const refusing: Action = async (previous, formData) => ({
      ...withErrors(formStateFrom<string>(formData, { fields: [], previous }), { "offset-r0": "offsetTooShort", prompt: "promptTooLong" }),
      saved: false,
    });
    const { container } = renderForm(refusing);
    const clean = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(clean.violations.map((v) => v.id)).toEqual([]);
    fireEvent.submit(container.querySelector("form")!);
    await screen.findByRole("alert");
    const refused = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(refused.violations.map((v) => v.id)).toEqual([]);
  }, 20000);
});
