// `components/admin/confirm-dialog.tsx` — the console's one confirmation
// (REQ-UIX-013): the object named, the consequence stated before the click,
// pending while the work runs. `DeactivateToggle` composes it since wave 8,
// with its props unchanged — proven here through the toggle.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { DeactivateToggle } from "@/components/admin/deactivate-toggle";
import { ToastProvider } from "@/components/ui/toast";

function renderToggle(onDeactivate: () => Promise<void>) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      <ToastProvider closeLabel="إغلاق">
        <main>
          <DeactivateToggle
            active
            activateLabel="أعد التفعيل"
            deactivateLabel="عطّل"
            confirmTitle="تعطيل «قاعة الابتكار»؟"
            confirmBody="لن تظهر القاعة عند جدولة جلسة جديدة."
            confirmAction="تأكيد التعطيل"
            cancelLabel="إلغاء"
            closeLabel="إغلاق"
            deactivateDoneLabel="تم التعطيل."
            reactivateDoneLabel="تمت إعادة التفعيل."
            onActivate={vi.fn()}
            onDeactivate={onDeactivate}
          />
        </main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfirmDialog, through DeactivateToggle", () => {
  it("names the object and the consequence before anything happens, then does the work, toasts and closes", async () => {
    let finish: () => void = () => {};
    const onDeactivate = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderToggle(onDeactivate);
    fireEvent.click(screen.getByRole("button", { name: "عطّل" }));
    const dialog = await screen.findByRole("dialog", { name: "تعطيل «قاعة الابتكار»؟" });
    expect(dialog).toHaveTextContent("لن تظهر القاعة عند جدولة جلسة جديدة.");
    expect(onDeactivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "تأكيد التعطيل" }));
    expect(onDeactivate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("button", { name: /تأكيد التعطيل/ })).toBeDisabled());
    finish();
    expect(await screen.findByText("تم التعطيل.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("has no axe violations while open", async () => {
    renderToggle(vi.fn(async () => {}));
    fireEvent.click(screen.getByRole("button", { name: "عطّل" }));
    await screen.findByRole("dialog");
    const { violations } = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  }, 20000);
});
