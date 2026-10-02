// SCR-060 in edit mode (`REQ-UIX-091`, `DEC-232` §1.3, §3) — re-says the deleted `reminders-form.test.tsx`'s cases
// against the artboard's table (ledger, wave 22): the stored units, the refusal at its row with the summary's link
// focusing the control, the toast from the action's RESULT — «حُفظ» only when the receipt wrote something, «لم يتغيّر
// شيء» when it wrote nothing — and axe; plus the read-mode contract: a staged switch writes nothing, the unsaved count,
// «(معدّل)» to a screen reader.
import type React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), Link: (props: React.ComponentProps<"a">) => <a {...props} /> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { RemindersEdit } = await import("@/app/[locale]/app/admin/reminders/reminders-edit");
const { ToastProvider } = await import("@/components/ui/toast");
const { formStateFrom, withErrors } = await import("@/lib/form-state");
import type { RemindersState } from "@/app/[locale]/app/admin/reminders/state";
import adminAr from "@/messages/ar/admin.json";
import notificationsAr from "@/messages/ar/notifications.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...notificationsAr, ...uiAr };
type Action = (previous: RemindersState, formData: FormData) => Promise<RemindersState>;
const empty = { errors: {}, formError: null, values: {}, lists: {}, attempt: 0 };

function renderEdit(action: Action) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>
          <RemindersEdit
            action={action}
            rows={[
              { key: "week", name: "التذكير قبل الجلسة بأسبوع", reminder: "قبل الجلسة", minutes: 10080, on: true, channels: "داخل التطبيق · بريد" },
              { key: "day", name: "التذكير قبل الجلسة بيوم", reminder: "قبل الجلسة", minutes: 1440, on: true, channels: "داخل التطبيق · بريد" },
              { key: "hours", name: "التذكير قبل الجلسة بساعتين", reminder: "قبل الجلسة", minutes: 120, on: true, channels: "داخل التطبيق · بريد" },
            ]}
            promptMinutes={60}
            promptChannels="داخل التطبيق · بريد"
            others={[]}
            opened={{ offsets: [10080, 1440, 120], prompt: 60 }}
          />
        </main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const timing = (name: string) => screen.getByRole("spinbutton", { name: new RegExp(`^${name} — التوقيت`) }) as HTMLInputElement;

describe("RemindersEdit", () => {
  it("shows each stored offset in the largest unit that divides it, every row on", () => {
    renderEdit(vi.fn());
    expect(timing("التذكير قبل الجلسة بأسبوع")).toHaveValue(7);
    expect(screen.getByRole("combobox", { name: "التذكير قبل الجلسة بأسبوع — التوقيت — الوحدة" })).toHaveValue("days");
    expect(timing("التذكير قبل الجلسة بساعتين")).toHaveValue(2);
    for (const name of ["بأسبوع", "بيوم", "بساعتين"]) {
      expect(screen.getByRole("switch", { name: new RegExp(`مفعّل — التذكير قبل الجلسة ${name}`) })).toBeChecked();
    }
  });

  it("a switch STAGES the change — nothing is written — and edit mode counts it and names it to a screen reader", async () => {
    const action = vi.fn<Action>();
    renderEdit(action);
    await userEvent.click(screen.getByRole("switch", { name: /مفعّل — التذكير قبل الجلسة بساعتين/ }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText("تغيير واحد غير محفوظ")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /مفعّل \(معدّل\) — التذكير قبل الجلسة بساعتين/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /احفظ \(1\)/ })).toBeEnabled();
  });

  it("a refusal lands at its row, keeps what was typed, and the summary's link focuses the control", async () => {
    const refusing: Action = async (_prev, formData) => ({ ...withErrors(formStateFrom<string>(formData, { fields: ["week-amount"] }), { week: "band.week" }), receipt: null });
    renderEdit(refusing);
    fireEvent.change(timing("التذكير قبل الجلسة بأسبوع"), { target: { value: "3" } });
    await userEvent.click(screen.getByRole("button", { name: /احفظ/ }));
    const summary = await screen.findByRole("alert");
    const link = within(summary).getByRole("link", { name: /التذكير قبل الجلسة بأسبوع/ });
    expect(timing("التذكير قبل الجلسة بأسبوع")).toHaveValue(3);
    expect(timing("التذكير قبل الجلسة بأسبوع")).toHaveAccessibleDescription("بين 6 و8 أيام.");
    fireEvent.click(link);
    expect(document.activeElement).toBe(timing("التذكير قبل الجلسة بأسبوع"));
  });

  it("«حُفظ» comes only from a receipt that wrote something, and the page goes back to read mode", async () => {
    let posted: FormData | null = null;
    renderEdit(async (_prev, formData) => {
      posted = formData;
      return { ...empty, receipt: { at: "2026-10-02T11:05:00+00:00", wrote: ["reminder_offsets_minutes"] } };
    });
    await userEvent.click(screen.getByRole("switch", { name: /التذكير قبل الجلسة بساعتين/ }));
    await userEvent.click(screen.getByRole("button", { name: /احفظ/ }));
    expect(await screen.findByText("حُفظ", { exact: true })).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/app/admin/reminders");
    expect(posted!.get("week-on")).toBe("on");
    expect(posted!.get("hours-on")).toBeNull();
    expect(JSON.parse(String(posted!.get("opened")))).toEqual({ offsets: [10080, 1440, 120], prompt: 60 });
  });

  it("an empty receipt says «لم يتغيّر شيء», never «حُفظ»", async () => {
    renderEdit(async () => ({ ...empty, receipt: { at: null, wrote: [] } }));
    fireEvent.change(timing("التذكير قبل الجلسة بأسبوع"), { target: { value: "8" } });
    fireEvent.change(timing("التذكير قبل الجلسة بأسبوع"), { target: { value: "7" } });
    fireEvent.submit(screen.getByRole("button", { name: /احفظ/ }).closest("form")!);
    expect(await screen.findByText("لم يتغيّر شيء", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("حُفظ", { exact: true })).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = renderEdit(vi.fn());
    const result = await axe.run(container, { rules: { region: { enabled: false } } });
    await waitFor(() => expect(result.violations.map((v) => v.id)).toEqual([]));
  });
});
