// REQ-EVT-008 (wave 22, F1) — «إبلاغ» on a photograph: a dialog, a reason said at the field and kept when refused, a
// line in place of the button once reported, and each refusal the database gives said in words.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import photosAr from "@/messages/ar/photos.json";
import uiAr from "@/messages/ar/ui.json";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("@/components/photos/actions", () => ({ reportPhotoAction: vi.fn().mockResolvedValue({ outcome: "reported" }) }));
const actions = await import("@/components/photos/actions");
const { ReportPhotoButton } = await import("@/components/photos/report-photo-button");

const messages = { ...photosAr, ...uiAr };

function mount(reported = false) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <ReportPhotoButton locale="ar" sessionId="s1" photoId="p1" reported={reported} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

async function send(reason: string) {
  await userEvent.click(screen.getByRole("button", { name: "إبلاغ" }));
  const dialog = await screen.findByRole("dialog", { name: "الإبلاغ عن صورة" });
  await userEvent.type(within(dialog).getByLabelText("سبب الإبلاغ", { exact: false }), reason);
  await userEvent.click(within(dialog).getByRole("button", { name: "إرسال البلاغ" }));
  return dialog;
}

describe("ReportPhotoButton", () => {
  it("★ sends the reason, then says the report is in, in place of the button", async () => {
    mount();
    await send("صورة لا تخص الجلسة");
    await waitFor(() => expect(actions.reportPhotoAction).toHaveBeenCalledWith("ar", "s1", "p1", "صورة لا تخص الجلسة"));
    expect(await screen.findAllByText("تم إرسال بلاغك عن هذه الصورة")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "إبلاغ" })).not.toBeInTheDocument();
  });

  it("already reported: the line, never the button", () => {
    mount(true);
    expect(screen.getByText("تم إرسال بلاغك عن هذه الصورة")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إبلاغ" })).not.toBeInTheDocument();
  });

  it("a refused reason is said at the field, and what was typed stays", async () => {
    vi.mocked(actions.reportPhotoAction).mockResolvedValueOnce({ outcome: "reason_required" });
    mount();
    const dialog = await send("ab");
    expect(await within(dialog).findByText("اكتب سببًا من 3 أحرف على الأقل.")).toBeVisible();
    expect(within(dialog).getByLabelText("سبب الإبلاغ", { exact: false })).toHaveValue("ab");
    await userEvent.type(within(dialog).getByLabelText("سبب الإبلاغ", { exact: false }), "c");
    expect(within(dialog).queryByText("اكتب سببًا من 3 أحرف على الأقل.")).not.toBeInTheDocument();
  });

  it("a photo no longer shown says so", async () => {
    vi.mocked(actions.reportPhotoAction).mockResolvedValueOnce({ outcome: "not_visible" });
    mount();
    await send("صورة لا تخص الجلسة");
    expect(await screen.findByText("لم تعد هذه الصورة معروضة.")).toBeInTheDocument();
  });

  it("has no axe violations with the dialog open", async () => {
    const { container } = mount();
    await userEvent.click(screen.getByRole("button", { name: "إبلاغ" }));
    await screen.findByRole("dialog");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  }, 20000);
});
