// `DeactivateToggle` (still composed by `recognition/badges-table.tsx`) learns, add-only, what «not written» is
// (`DEC-232` §3.1): a write that answers `{ ok: false }` toasts the caller's `notWrittenLabel` and keeps the dialog
// open, never «تم التعطيل.». A caller that passes neither — `confirm-dialog.test.tsx`'s — behaves as before.
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { DeactivateToggle } from "@/components/admin/deactivate-toggle";
import { ToastProvider } from "@/components/ui/toast";

function renderToggle(active: boolean, onWrite: () => Promise<{ ok: boolean }>) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      <ToastProvider closeLabel="إغلاق">
        <main>
          <DeactivateToggle
            active={active}
            activateLabel="أعد التفعيل"
            deactivateLabel="عطّل"
            confirmTitle="تعطيل «قاعة الابتكار»؟"
            confirmBody="لن تظهر القاعة عند جدولة جلسة جديدة."
            confirmAction="تأكيد التعطيل"
            cancelLabel="إلغاء"
            closeLabel="إغلاق"
            deactivateDoneLabel="تم التعطيل."
            reactivateDoneLabel="تمت إعادة التفعيل."
            notWrittenLabel="لم يُحفظ — حاول مرة أخرى."
            onActivate={onWrite}
            onDeactivate={onWrite}
          />
        </main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("DeactivateToggle — a write that did not write", () => {
  it("deactivating: «لم يُحفظ», never «تم التعطيل.», and the dialog stays", async () => {
    renderToggle(true, vi.fn(async () => ({ ok: false })));
    fireEvent.click(screen.getByRole("button", { name: "عطّل" }));
    fireEvent.click(await screen.findByRole("button", { name: "تأكيد التعطيل" }));
    expect(await screen.findByText("لم يُحفظ — حاول مرة أخرى.", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("تم التعطيل.", { exact: true })).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("reactivating: «لم يُحفظ», never «تمت إعادة التفعيل.»; and { ok: true } is a success", async () => {
    const onWrite = vi.fn<() => Promise<{ ok: boolean }>>().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    renderToggle(false, onWrite);
    fireEvent.click(screen.getByRole("button", { name: "أعد التفعيل" }));
    expect(await screen.findByText("لم يُحفظ — حاول مرة أخرى.", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "أعد التفعيل" }));
    expect(await screen.findByText("تمت إعادة التفعيل.", { exact: true })).toBeInTheDocument();
  });
});
