// «أرسل اختبارًا» never mails a different message from the one on screen — REQ-NTF-011, DEC-238 §4.5.
//
// `send_test_email()` renders the SAVED row. Before this, an admin who edited a subject and pressed the test button
// received the old one — a test that taught them the wrong thing about their own design (`notify`'s finding at wave
// 23's sync 1). Now the button is disabled while the subject or the document differs from the last save, says why in
// three words, and comes back the moment the save lands.
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import notificationsAr from "@/messages/ar/notifications.json";
import uiAr from "@/messages/ar/ui.json";

vi.mock("@/components/email/preview-pane", () => ({ PreviewPane: () => null }));

import { BlockEditor } from "@/components/email/block-editor";

const messages = { ...notificationsAr, ...uiAr };
const DOC = { schemaVersion: 1, blocks: [{ type: "paragraph", id: "p1", text: "أهلًا {{member.name}}" }] };

function mount(action = vi.fn(async () => ({ saved: true }) as never)) {
  const sendTest = vi.fn(async () => ({ status: "queued" }));
  render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <BlockEditor
          messageKey="MSG-session_reminder"
          initialSubject="تذكير بالجلسة"
          initialBody=""
          initialBlocks={DOC}
          offered={["member.name"]}
          action={action}
          sendTest={sendTest}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { sendTest, action };
}

const testButton = () => screen.getByRole("button", { name: "أرسل اختبارًا" });

describe("BlockEditor — the test send is the saved mail", () => {
  it("is enabled for an untouched design, and sends", async () => {
    const { sendTest } = mount();
    expect(testButton()).toBeEnabled();
    expect(screen.queryByText("احفظ قبل الاختبار.")).toBeNull();
    await act(async () => fireEvent.click(testButton()));
    expect(sendTest).toHaveBeenCalledTimes(1);
  });

  it("is disabled while the subject differs from the save, and says to save first", () => {
    const { sendTest } = mount();
    fireEvent.change(screen.getByLabelText(/موضوع الرسالة/), { target: { value: "تذكير معدّل" } });
    expect(testButton()).toBeDisabled();
    expect(screen.getByText("احفظ قبل الاختبار.")).toBeTruthy();
    fireEvent.click(testButton());
    expect(sendTest).not.toHaveBeenCalled();
  });

  it("comes back once the save lands — the snapshot moves on the server's answer", async () => {
    mount();
    fireEvent.change(screen.getByLabelText(/موضوع الرسالة/), { target: { value: "تذكير معدّل" } });
    expect(testButton()).toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /احفظ/ })));
    await waitFor(() => expect(testButton()).toBeEnabled());
    expect(screen.queryByText("احفظ قبل الاختبار.")).toBeNull();
  });

  it("stays disabled when the save fails", async () => {
    mount(vi.fn(async () => ({ saved: false, formError: "notPermitted" }) as never));
    fireEvent.change(screen.getByLabelText(/موضوع الرسالة/), { target: { value: "تذكير معدّل" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /احفظ/ })));
    await waitFor(() => expect(screen.getByText("احفظ قبل الاختبار.")).toBeTruthy());
    expect(testButton()).toBeDisabled();
  });
});
